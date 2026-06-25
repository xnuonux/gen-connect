// the spend-ceiling concurrency proof. the gc_reserve_usage rpc (migration v0_1_6)
// claims two concurrent /api/gen turns can't both slip past the daily cap: it takes
// a per-user advisory xact lock, re-reads today's spend INSIDE the lock, and inserts
// the projected cost only if it still fits. this hammers that invariant for real.
//
// it spins up a THROWAWAY auth user (zero prior spend, full isolation ... your real
// ledger is never touched), signs in AS that user (the rpc is SECURITY INVOKER and
// keys on auth.uid()), then fires N concurrent reserves at a tiny ceiling. if the
// lock works, exactly ceiling/cost reserves are granted and the committed total
// never exceeds the ceiling. a race would grant too many. cleans up the user + rows.
//
// run: node scripts/verify-reserve.mjs

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

function loadEnv(url) {
  try {
    for (const line of readFileSync(url, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (!m) continue;
      let v = m[2] ?? "";
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      if (!(m[1] in process.env)) process.env[m[1]] = v;
    }
  } catch {}
}
loadEnv(new URL("../.env.local", import.meta.url));

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPA_URL || !ANON || !SVC) {
  console.error("missing supabase url / anon / service role in .env.local.");
  process.exit(2);
}

let fails = 0;
function ok(name, cond, extra) {
  if (cond) console.log(`  ok   ${name}`);
  else {
    fails++;
    console.error(`  FAIL ${name}`, extra ?? "");
  }
}

const admin = createClient(SUPA_URL, SVC, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// --- spin up a throwaway, fully-isolated user ---
const stamp = Date.now();
const email = `reserve-probe-${stamp}@example.com`;
const password = `Probe!${stamp}xZ`;
const { data: created, error: cErr } = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
});
if (cErr || !created?.user) {
  console.error("createUser failed:", cErr?.message);
  process.exit(2);
}
const testUserId = created.user.id;
console.log(`throwaway user ${email} (${testUserId.slice(0, 8)}...)`);

async function cleanup() {
  try {
    await admin.from("gc_usage_events").delete().eq("user_id", testUserId);
  } catch {}
  try {
    await admin.auth.admin.deleteUser(testUserId);
  } catch {}
}

const CEILING = 100; // cents
const COST = 10; // cents/reserve
const N = 30; // concurrent attempts (3x the grants that should fit)
const EXPECT_GRANTS = Math.floor(CEILING / COST); // 10

try {
  // sign IN as the throwaway user so the rpc sees auth.uid() === testUserId.
  const userClient = createClient(SUPA_URL, ANON, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: sErr } = await userClient.auth.signInWithPassword({ email, password });
  if (sErr) throw new Error(`sign in: ${sErr.message}`);

  const reserve = () =>
    userClient.rpc("gc_reserve_usage", {
      p_kind: "verify_reserve",
      p_units: 1,
      p_cost_cents: COST,
      p_ceiling_cents: CEILING,
    });

  // --- the main event: N concurrent reserves at a cap that fits only EXPECT_GRANTS ---
  console.log(`\nfiring ${N} concurrent reserves @ ${COST}c against a ${CEILING}c ceiling ...\n`);
  const results = await Promise.all(Array.from({ length: N }, () => reserve()));

  const rows = results.map((r) => (r.error ? { error: r.error.message } : r.data));
  const errored = rows.filter((r) => r && r.error);
  ok("no rpc errored", errored.length === 0, JSON.stringify(errored.slice(0, 2)));

  const granted = rows.filter((r) => r && r.reserved === true);
  const denied = rows.filter((r) => r && r.reserved === false);
  ok(`exactly ${EXPECT_GRANTS} reserves granted`, granted.length === EXPECT_GRANTS, `granted=${granted.length}`);
  ok("the rest were denied", denied.length === N - EXPECT_GRANTS, `denied=${denied.length}`);
  ok(
    "every denial cites the daily cap",
    denied.length > 0 && denied.every((r) => r.reason === "daily_cap"),
    JSON.stringify([...new Set(denied.map((r) => r?.reason))]),
  );
  ok(
    "no granted reserve ever reported over the ceiling",
    granted.every((r) => Number(r.spent_cents) <= CEILING),
    JSON.stringify(granted.map((r) => r.spent_cents).sort((a, b) => a - b)),
  );

  // ground truth: the committed ledger total must equal the ceiling, never exceed it.
  const { data: ledger } = await admin
    .from("gc_usage_events")
    .select("cost_cents")
    .eq("user_id", testUserId);
  const total = (ledger ?? []).reduce((s, r) => s + (Number(r.cost_cents) || 0), 0);
  ok("committed ledger total == ceiling (no overshoot)", total === CEILING, `total=${total}`);
  ok("committed row count == grants", (ledger ?? []).length === EXPECT_GRANTS, `rows=${(ledger ?? []).length}`);

  // --- edge cases ---
  // a single oversized reserve on an already-full ledger is denied.
  const over = await userClient.rpc("gc_reserve_usage", {
    p_kind: "verify_reserve",
    p_units: 1,
    p_cost_cents: 1,
    p_ceiling_cents: CEILING,
  });
  ok("a reserve past a full ceiling is denied", over.data?.reserved === false && over.data?.reason === "daily_cap", JSON.stringify(over.data));

  // a negative amount reserves nothing (defense in depth over the non-neg constraint).
  const neg = await userClient.rpc("gc_reserve_usage", {
    p_kind: "verify_reserve",
    p_units: 1,
    p_cost_cents: -50,
    p_ceiling_cents: CEILING,
  });
  ok("a negative cost is rejected", neg.data?.reserved === false && neg.data?.reason === "invalid_amount", JSON.stringify(neg.data));

  // service-role (no auth.uid()) reserves nothing ... the rpc is user-scoped.
  const anon = await admin.rpc("gc_reserve_usage", {
    p_kind: "verify_reserve",
    p_units: 1,
    p_cost_cents: 1,
    p_ceiling_cents: CEILING,
  });
  ok("unauthenticated caller reserves nothing", anon.data?.reserved === false && anon.data?.reason === "unauthenticated", JSON.stringify(anon.data));
} catch (e) {
  console.error("\nharness error:", e.message);
  fails++;
} finally {
  await cleanup();
  console.log("\ncleaned up the throwaway user + its ledger rows.");
}

console.log(`\n${fails === 0 ? "PASS" : "FAIL"}: spend ceiling holds under concurrency (${fails} failures)`);
process.exit(fails === 0 ? 0 : 1);
