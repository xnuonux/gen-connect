// inbound webhook end-to-end proof: the FIRST half of the "a reply threads in
// live" wedge (realtime delivery is the second half, see verify-realtime.mjs).
//
// it seeds a real contact + thread, signs an inbound resend payload exactly the
// way resend's svix scheme does, POSTs it to the running dev server's webhook,
// and asserts a real inbound row landed on the right thread, the thread bumped,
// and the contact lifted to 'replied'. then (if a webhook secret is configured)
// it confirms a tampered signature is rejected with 401. cleans up every row.
//
// run (dev server must be up on the BASE url):
//   pnpm dev   # in another shell, or started by the runner
//   node --import ./scripts/load-env.mjs --import ./test/register-alias.mjs scripts/verify-inbound.mjs
//
// .env.local is pre-imported (load-env.mjs) so the token secret matches the server.

import { createHmac } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { buildReplyTo } from "../src/lib/email/thread-token.ts";

const SUPA_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
const EMAIL = process.env.DEV_LOGIN_EMAIL ?? "xnuonux@gmail.com";
const WHSEC = process.env.RESEND_WEBHOOK_SECRET ?? null;
const BASE = process.env.VERIFY_BASE_URL ?? "http://localhost:3001";
const FROM = process.env.GEN_FROM_ADDRESS ?? "gen <gen@lunari.pro>";

if (!SUPA_URL || !SVC) {
  console.error("missing supabase url / service role in .env.local.");
  process.exit(2);
}

let fails = 0;
function ok(name, cond, extra) {
  if (cond) {
    console.log(`  ok   ${name}`);
  } else {
    fails++;
    console.error(`  FAIL ${name}`, extra ?? "");
  }
}

const admin = createClient(SUPA_URL, SVC, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// --- resolve the dev user (the thread owner) ---
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
console.log(`thread owner ${EMAIL} (${userId.slice(0, 8)}...)`);
console.log(`webhook signing: ${WHSEC ? "ON (svix)" : "OFF (dev unsigned)"}`);
console.log(`target: ${BASE}/api/webhooks/resend\n`);

// --- seed a contact + thread to reply into ---
const senderEmail = "inbound-probe@example.com";
const { data: contact, error: cErr } = await admin
  .from("gc_contacts")
  .insert({
    user_id: userId,
    email: senderEmail,
    name: "inbound probe",
    // 'sequenced' is upgradeable, so a reply should lift it to 'replied'.
    stage: "sequenced",
  })
  .select("id")
  .single();
if (cErr) {
  console.error("seed contact failed:", cErr.message);
  process.exit(2);
}
const contactId = contact.id;
const { data: thread, error: tErr } = await admin
  .from("gc_unibox_threads")
  .insert({
    user_id: userId,
    contact_id: contactId,
    channel: "email",
    status: "open",
    unread_count: 0,
    last_message_at: new Date().toISOString(),
  })
  .select("id")
  .single();
if (tErr) {
  console.error("seed thread failed:", tErr.message);
  await admin.from("gc_contacts").delete().eq("id", contactId);
  process.exit(2);
}
const threadId = thread.id;

async function cleanup() {
  await admin.from("gc_unibox_messages").delete().eq("thread_id", threadId);
  await admin.from("gc_unibox_threads").delete().eq("id", threadId);
  await admin.from("gc_contacts").delete().eq("id", contactId);
}

// --- craft the inbound payload, threaded via the signed reply-to token ---
const replyTo = buildReplyTo(threadId, FROM); // gen+t.<threadId>.<sig>@lunari.pro
const providerId = `re_verify_${Date.now()}`;
const newBody = "this is the live reply body";
const payload = {
  type: "email.received",
  data: {
    from: "Probe Sender <inbound-probe@example.com>",
    to: [replyTo],
    subject: "re: verify inbound",
    text: `${newBody}\n\nOn Mon, Jun 9 2026, gen wrote:\n> the original pitch\n> body text`,
    email_id: providerId,
    headers: [
      { name: "Message-ID", value: `<verify-${Date.now()}@example.com>` },
    ],
  },
};
const raw = JSON.stringify(payload);

function svixHeaders(body) {
  if (!WHSEC) return { "content-type": "application/json" };
  const id = `msg_verify_${Date.now()}`;
  const ts = Math.floor(Date.now() / 1000).toString();
  const key = Buffer.from(WHSEC.replace(/^whsec_/, ""), "base64");
  const sig = createHmac("sha256", key).update(`${id}.${ts}.${body}`).digest("base64");
  return {
    "content-type": "application/json",
    "svix-id": id,
    "svix-timestamp": ts,
    "svix-signature": `v1,${sig}`,
  };
}

// --- 1. happy path: a properly-signed inbound threads in ---
let res;
try {
  res = await fetch(`${BASE}/api/webhooks/resend`, {
    method: "POST",
    headers: svixHeaders(raw),
    body: raw,
  });
} catch (e) {
  console.error(`\ncould not reach ${BASE} ... is the dev server up?`, e.message);
  await cleanup();
  process.exit(2);
}
const json = await res.json().catch(() => ({}));
ok("webhook returns 200", res.status === 200, res.status);
ok("webhook reports matched", json.matched === true, JSON.stringify(json));

// give the write a beat, then assert the row landed
await new Promise((r) => setTimeout(r, 400));
const { data: msgs } = await admin
  .from("gc_unibox_messages")
  .select("id, direction, body, message_id_header")
  .eq("thread_id", threadId)
  .eq("direction", "inbound");
const landed = (msgs ?? []).find((m) => m.message_id_header === providerId);
ok("inbound row landed on the thread", !!landed, JSON.stringify(msgs));
ok(
  "quoted block stripped to the new reply",
  landed?.body === newBody,
  JSON.stringify(landed?.body),
);

const { data: tAfter } = await admin
  .from("gc_unibox_threads")
  .select("unread_count")
  .eq("id", threadId)
  .maybeSingle();
ok("thread unread bumped", (tAfter?.unread_count ?? 0) >= 1, tAfter?.unread_count);

const { data: cAfter } = await admin
  .from("gc_contacts")
  .select("stage")
  .eq("id", contactId)
  .maybeSingle();
ok("contact lifted to replied", cAfter?.stage === "replied", cAfter?.stage);

// --- 2. dedupe: the SAME payload again must not double-insert ---
const res2 = await fetch(`${BASE}/api/webhooks/resend`, {
  method: "POST",
  headers: svixHeaders(raw),
  body: raw,
});
await res2.json().catch(() => ({}));
await new Promise((r) => setTimeout(r, 400));
const { count: dupCount } = await admin
  .from("gc_unibox_messages")
  .select("id", { count: "exact", head: true })
  .eq("thread_id", threadId)
  .eq("message_id_header", providerId);
ok("redelivery did not double-insert", (dupCount ?? 0) === 1, dupCount);

// --- 3. security: a tampered signature is rejected (only when signing is on) ---
if (WHSEC) {
  const h = svixHeaders(raw);
  h["svix-signature"] = "v1,deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdead=";
  const resBad = await fetch(`${BASE}/api/webhooks/resend`, {
    method: "POST",
    headers: h,
    body: raw,
  });
  ok("tampered signature rejected (401)", resBad.status === 401, resBad.status);
} else {
  console.log("  skip tampered-signature test (no RESEND_WEBHOOK_SECRET in dev)");
}

await cleanup();
console.log(`\n${fails === 0 ? "PASS" : "FAIL"}: inbound webhook end-to-end (${fails} failures)`);
process.exit(fails === 0 ? 0 : 1);
