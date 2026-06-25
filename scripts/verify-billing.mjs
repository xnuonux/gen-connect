// stripe billing webhook proof: a signed event actually flips the entitlement.
// same shape as the inbound-webhook proof ... real route, real signature verify,
// real db. no stripe account or live key needed: stripe's own
// generateTestHeaderString + constructEvent are pure crypto, so a dummy key signs
// and the route verifies against the shared test webhook secret.
//
// requires the dev server up with these env vars (the runner sets them):
//   STRIPE_SECRET_KEY=sk_test_dummy
//   STRIPE_WEBHOOK_SECRET=whsec_verifybilling
//   STRIPE_PRICE_CREATOR=price_creator_x   STRIPE_PRICE_PRO=price_pro_y
//
// run: node scripts/verify-billing.mjs
// it spins up a throwaway user, fires checkout.session.completed (-> paid) then
// customer.subscription.deleted (-> free), asserts gc_user_entitlements + the
// gc_billing_subscriptions record each step, checks a tampered sig is rejected,
// and cleans everything up.

import { readFileSync } from "node:fs";
import Stripe from "stripe";
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
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BASE = process.env.VERIFY_BASE_URL ?? "http://localhost:3001";
const WEBHOOK_SECRET = "whsec_verifybilling"; // must match the dev server
const PRICE_CREATOR = "price_creator_x"; // must match the dev server STRIPE_PRICE_CREATOR
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
const stripe = new Stripe("sk_test_dummy_for_signing");

function post(payload, { tamper = false } = {}) {
  const body = JSON.stringify(payload);
  let header = stripe.webhooks.generateTestHeaderString({ payload: body, secret: WEBHOOK_SECRET });
  if (tamper) header = header.replace(/v1=[0-9a-f]{8}/, "v1=deadbeef");
  return fetch(`${BASE}/api/webhooks/stripe`, {
    method: "POST",
    headers: { "content-type": "application/json", "stripe-signature": header },
    body,
  });
}

async function tierOf(userId) {
  const { data } = await admin
    .from("gc_user_entitlements")
    .select("tier")
    .eq("user_id", userId)
    .maybeSingle();
  return data?.tier ?? null;
}
async function subOf(userId) {
  const { data } = await admin
    .from("gc_billing_subscriptions")
    .select("plan, status, stripe_customer_id")
    .eq("user_id", userId)
    .maybeSingle();
  return data ?? null;
}

// --- throwaway user ---
const stamp = Date.now();
const email = `billing-probe-${stamp}@example.com`;
const { data: created, error: cErr } = await admin.auth.admin.createUser({
  email,
  password: `Probe!${stamp}xZ`,
  email_confirm: true,
});
if (cErr || !created?.user) {
  console.error("createUser failed:", cErr?.message);
  process.exit(2);
}
const userId = created.user.id;
console.log(`throwaway user ${email} (${userId.slice(0, 8)}...)`);
console.log(`target: ${BASE}/api/webhooks/stripe\n`);

async function cleanup() {
  try { await admin.from("gc_billing_subscriptions").delete().eq("user_id", userId); } catch {}
  try { await admin.from("gc_user_entitlements").delete().eq("user_id", userId); } catch {}
  try { await admin.auth.admin.deleteUser(userId); } catch {}
}

try {
  // baseline: a fresh user is free (no entitlement row).
  ok("fresh user starts free", (await tierOf(userId)) === null);

  // 1. checkout.session.completed -> paid
  const checkout = {
    id: `evt_${stamp}_1`,
    type: "checkout.session.completed",
    data: {
      object: {
        id: `cs_${stamp}`,
        object: "checkout.session",
        client_reference_id: userId,
        customer: "cus_verify",
        subscription: "sub_verify",
        metadata: { userId, plan: "creator" },
      },
    },
  };
  const r1 = await post(checkout);
  const j1 = await r1.json().catch(() => ({}));
  ok("checkout webhook 200", r1.status === 200, `${r1.status} ${JSON.stringify(j1)}`);
  await new Promise((r) => setTimeout(r, 400));
  ok("entitlement flipped to paid", (await tierOf(userId)) === "paid");
  const s1 = await subOf(userId);
  ok("subscription recorded (creator/active/customer)", s1?.plan === "creator" && s1?.status === "active" && s1?.stripe_customer_id === "cus_verify", JSON.stringify(s1));

  // 2. customer.subscription.deleted -> free
  const deleted = {
    id: `evt_${stamp}_2`,
    type: "customer.subscription.deleted",
    data: {
      object: {
        id: "sub_verify",
        object: "subscription",
        customer: "cus_verify",
        status: "canceled",
        metadata: { userId, plan: "creator" },
        items: { data: [{ price: { id: PRICE_CREATOR } }] },
      },
    },
  };
  const r2 = await post(deleted);
  ok("delete webhook 200", r2.status === 200, r2.status);
  await new Promise((r) => setTimeout(r, 400));
  ok("entitlement flipped back to free", (await tierOf(userId)) === "free");
  const s2 = await subOf(userId);
  ok("subscription marked canceled (plan resolved from price)", s2?.status === "canceled" && s2?.plan === "creator", JSON.stringify(s2));

  // 3. tampered signature -> 400
  const r3 = await post(checkout, { tamper: true });
  ok("tampered signature rejected (400)", r3.status === 400, r3.status);
} catch (e) {
  console.error("\nharness error:", e.message);
  fails++;
} finally {
  await cleanup();
  console.log("\ncleaned up the throwaway user + its billing rows.");
}

console.log(`\n${fails === 0 ? "PASS" : "FAIL"}: stripe webhook flips the entitlement (${fails} failures)`);
process.exit(fails === 0 ? 0 : 1);
