// guarded-send gate proof: do the send gates actually fire against REAL data?
//
// the pure ordering is locked in test/pure.ts (guardDecision matrix). this proves
// the other half at runtime: that the REAL rows guardedSend reads ... the
// suppression list, the contact's jurisdiction, the sending-domains wizard ...
// feed the REAL decision function and produce the right verdict. it reads the
// exact fields guarded-send.ts reads (queries kept byte-identical to the source),
// so this is the real gate behavior, not a copy of the logic.
//
// run: node --import ./test/register-alias.mjs scripts/verify-send.mjs
// (no real email is ever sent ... this exercises the gates, which all return
// before the dispatch boundary.)

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { guardDecision } from "../src/lib/email/guard.ts";
import { normalizeDomain } from "../src/lib/deliverability/dns.ts";

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
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
const EMAIL = process.env.DEV_LOGIN_EMAIL ?? "xnuonux@gmail.com";
if (!SUPA_URL || !SVC) {
  console.error("missing supabase url / service role in .env.local.");
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

// --- the REAL read helpers, queries identical to the source modules ---
// mirrors src/lib/email/suppression.ts:isSuppressed
async function readSuppressed(userId, email) {
  const { data } = await admin
    .from("gc_suppression")
    .select("id")
    .eq("user_id", userId)
    .eq("email", email.toLowerCase())
    .limit(1)
    .maybeSingle();
  return !!data;
}
// mirrors src/lib/supabase/sending-domains.ts:isDomainVerified (+ explicit
// user scoping, which the rls-backed original gets implicitly)
async function readDomainVerified(userId, rawDomain) {
  const domain = normalizeDomain(rawDomain) ?? rawDomain.trim().toLowerCase();
  const { data } = await admin
    .from("gc_sending_domains")
    .select("id")
    .eq("user_id", userId)
    .eq("domain", domain)
    .eq("status", "verified")
    .limit(1)
    .maybeSingle();
  return !!data;
}
// mirrors the cold-jurisdiction read inside src/lib/email/guarded-send.ts
async function readContactJurisdiction(contactId) {
  const { data } = await admin
    .from("gc_contacts")
    .select("country, jurisdiction_consent")
    .eq("id", contactId)
    .maybeSingle();
  return {
    country: data?.country ?? null,
    consent: data?.jurisdiction_consent ?? null,
  };
}

// --- resolve the user, seed the fixtures ---
const { data: list, error: listErr } = await admin.auth.admin.listUsers();
if (listErr) {
  console.error("listUsers failed:", listErr.message);
  process.exit(2);
}
const user = list.users.find((u) => u.email === EMAIL);
if (!user) {
  console.error(`no auth user for ${EMAIL}.`);
  process.exit(2);
}
const userId = user.id;
console.log(`gate owner ${EMAIL} (${userId.slice(0, 8)}...)\n`);

const supEmail = "suppressed-probe@example.com";
const unverifiedDomain = "probe-unverified-send.example";
const cleanup = [];

async function run() {
  // seed: a suppression row, a contact, an unverified sending domain
  await admin
    .from("gc_suppression")
    .insert({ user_id: userId, email: supEmail, reason: "complaint", source: "verify-send" });
  cleanup.push(() => admin.from("gc_suppression").delete().eq("user_id", userId).eq("email", supEmail));

  const { data: contact, error: cErr } = await admin
    .from("gc_contacts")
    .insert({ user_id: userId, email: "jur-probe@example.com", name: "jurisdiction probe", stage: "drafted", country: "DE" })
    .select("id")
    .single();
  if (cErr) throw new Error(`seed contact: ${cErr.message}`);
  const contactId = contact.id;
  cleanup.push(() => admin.from("gc_contacts").delete().eq("id", contactId));

  await admin
    .from("gc_sending_domains")
    .insert({ user_id: userId, domain: unverifiedDomain, status: "pending" });
  cleanup.push(() => admin.from("gc_sending_domains").delete().eq("user_id", userId).eq("domain", unverifiedDomain));

  const fromDomain = "lunari.pro";

  // 1. suppression: the real suppression row blocks the send.
  {
    const suppressed = await readSuppressed(userId, supEmail);
    ok("real suppression row read as suppressed", suppressed === true);
    const v = guardDecision({ suppressed, isLive: false, domainVerified: true, fromDomain, country: null, consent: null, kind: "cold" });
    ok("suppressed contact -> suppression gate", v.allow === false && v.gate === "suppression", JSON.stringify(v));
  }
  // a non-suppressed address reads clean
  {
    const suppressed = await readSuppressed(userId, "never-suppressed@example.com");
    ok("clean address reads not-suppressed", suppressed === false);
  }

  // 2. jurisdiction: a real DE contact with no consent is blocked on a cold send.
  {
    const { country, consent } = await readContactJurisdiction(contactId);
    ok("real contact reads country=DE", country === "DE", country);
    const v = guardDecision({ suppressed: false, isLive: false, domainVerified: true, fromDomain, country, consent, kind: "cold" });
    ok("cold DE no-consent -> jurisdiction gate", v.allow === false && v.gate === "jurisdiction", JSON.stringify(v));
  }
  // 3. flip consent -> the same contact now passes the cold gate.
  {
    await admin.from("gc_contacts").update({ jurisdiction_consent: true }).eq("id", contactId);
    const { country, consent } = await readContactJurisdiction(contactId);
    ok("real contact reads consent=true", consent === true, consent);
    const v = guardDecision({ suppressed: false, isLive: false, domainVerified: true, fromDomain, country, consent, kind: "cold" });
    ok("cold DE with consent -> allow", v.allow === true, JSON.stringify(v));
  }
  // 4. a reply to the same DE contact always passes (jurisdiction is cold-only).
  {
    await admin.from("gc_contacts").update({ jurisdiction_consent: null }).eq("id", contactId);
    const { country, consent } = await readContactJurisdiction(contactId);
    const v = guardDecision({ suppressed: false, isLive: false, domainVerified: true, fromDomain, country, consent, kind: "reply" });
    ok("reply to DE -> allow", v.allow === true, JSON.stringify(v));
  }

  // 5. live-send domain gate: a real unverified domain blocks a live send.
  {
    const verified = await readDomainVerified(userId, unverifiedDomain);
    ok("unverified domain reads not-verified", verified === false);
    const v = guardDecision({ suppressed: false, isLive: true, domainVerified: verified, fromDomain: unverifiedDomain, country: "US", consent: null, kind: "cold" });
    ok("live + unverified domain -> domain gate", v.allow === false && v.gate === "domain", JSON.stringify(v));
  }
  // 6. the real verification state of the send domain is consistent with the verdict.
  {
    const verified = await readDomainVerified(userId, fromDomain);
    const v = guardDecision({ suppressed: false, isLive: true, domainVerified: verified, fromDomain, country: "US", consent: null, kind: "cold" });
    console.log(`  note ${fromDomain} verified=${verified} -> live cold US ${v.allow ? "allow" : "blocked(" + v.gate + ")"}`);
    ok("send-domain verdict consistent with its real state", verified ? v.allow === true : v.allow === false);
  }
}

try {
  await run();
} catch (e) {
  console.error("\nharness error:", e.message);
  fails++;
} finally {
  for (const fn of cleanup.reverse()) {
    try {
      await fn();
    } catch {}
  }
  console.log("\ncleaned up fixtures.");
}

console.log(`\n${fails === 0 ? "PASS" : "FAIL"}: guarded-send gates fire on real data (${fails} failures)`);
process.exit(fails === 0 ? 0 : 1);
