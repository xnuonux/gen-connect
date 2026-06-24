// realtime delivery proof for the unibox live-push. no browser needed.
//
// it mints a real user session (the dev-login magic-link path), then runs three
// subscription trials against the LIVE supabase project to find out exactly when
// a postgres_changes INSERT reaches an rls-scoped client:
//
//   A  anon, no token            -> expect NO event   (rls is active on realtime)
//   B  setAuth THEN subscribe     -> expect the event  (the fix + infra is sound)
//   C  subscribe THEN setAuth     -> mimics the browser cookie-hydration race
//
// if C drops the event but B delivers it, the ordering bug is confirmed and the
// fix is "authenticate the realtime socket before subscribing". run:
//   node scripts/verify-realtime.mjs
//
// it loads .env.local itself (never echoes the secrets) and cleans up every row
// it writes. exit 0 only if the truth table is internally consistent (A empty,
// B delivers).

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

function loadEnv(url) {
  let txt;
  try {
    txt = readFileSync(url, "utf8");
  } catch {
    return;
  }
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    let v = m[2] ?? "";
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (!(m[1] in process.env)) process.env[m[1]] = v;
  }
}
loadEnv(new URL("../.env.local", import.meta.url));

const SUPA_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const ANON =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
const EMAIL = process.env.DEV_LOGIN_EMAIL ?? "xnuonux@gmail.com";

if (!SUPA_URL || !ANON || !SVC) {
  console.error("missing env (url / anon / service role). check .env.local.");
  process.exit(2);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const WAIT_MS = 7000;

const admin = createClient(SUPA_URL, SVC, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// --- mint a real user session via the admin magic-link path (no email sent) ---
async function mintSession() {
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: EMAIL,
  });
  if (linkErr || !link?.properties?.hashed_token) {
    console.error("generateLink failed:", linkErr?.message ?? "no token");
    process.exit(2);
  }
  const verifier = createClient(SUPA_URL, ANON, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: sess, error: vErr } = await verifier.auth.verifyOtp({
    type: "magiclink",
    token_hash: link.properties.hashed_token,
  });
  if (vErr || !sess?.session) {
    console.error("verifyOtp failed:", vErr?.message ?? "no session");
    process.exit(2);
  }
  return sess.session;
}

const session = await mintSession();
const ACCESS = session.access_token;
const REFRESH = session.refresh_token;
const userId = session.user.id;
console.log(`minted session for ${EMAIL} (user ${userId.slice(0, 8)}...)`);

// --- ensure a thread to insert into; track what we create so we can clean up ---
let threadId = null;
let createdContactId = null;
let createdThread = false;
{
  const { data: t } = await admin
    .from("gc_unibox_threads")
    .select("id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  if (t) {
    threadId = t.id;
  } else {
    const { data: c, error: cErr } = await admin
      .from("gc_contacts")
      .insert({
        user_id: userId,
        email: "realtime-probe@example.com",
        name: "realtime probe",
        stage: "replied",
      })
      .select("id")
      .single();
    if (cErr) {
      console.error("probe contact insert failed:", cErr.message);
      process.exit(2);
    }
    createdContactId = c.id;
    const { data: nt, error: ntErr } = await admin
      .from("gc_unibox_threads")
      .insert({
        user_id: userId,
        contact_id: createdContactId,
        channel: "email",
        status: "open",
        last_message_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (ntErr) {
      console.error("probe thread insert failed:", ntErr.message);
      process.exit(2);
    }
    threadId = nt.id;
    createdThread = true;
  }
}

const insertedKeys = [];
async function insertProbe(tag) {
  const key = `<rtprobe.${tag}.${Date.now()}@probe>`;
  insertedKeys.push(key);
  const { error } = await admin.from("gc_unibox_messages").insert({
    user_id: userId,
    thread_id: threadId,
    direction: "inbound",
    subject: "realtime probe",
    body: `probe ${tag}`,
    message_id_header: key,
    sent_at: new Date().toISOString(),
  });
  if (error) console.error(`  insert(${tag}) error:`, error.message);
}

async function maybeAwait(x) {
  if (x && typeof x.then === "function") await x;
}

// run one trial. order = 'before' | 'after' | 'none' | 'hook'
//   hook = the exact sequence the shipped useRealtimeInvalidate runs in the
//   browser: a session present (cookie-hydrated) -> getSession() -> setAuth ->
//   subscribe. proves the production code path delivers, not just a bare setAuth.
async function trial(name, order) {
  const client = createClient(SUPA_URL, ANON, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  let received = 0;

  if (order === "hook") {
    // mirror the browser: the cookie session is already present on the client.
    await client.auth.setSession({
      access_token: ACCESS,
      refresh_token: REFRESH,
    });
    const { data } = await client.auth.getSession();
    const token = data.session?.access_token;
    if (token) await maybeAwait(client.realtime.setAuth(token));
  }

  if (order === "before") await maybeAwait(client.realtime.setAuth(ACCESS));

  const ch = client
    .channel(`probe-${name}-${Date.now()}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "gc_unibox_messages" },
      () => {
        received++;
      },
    );

  const status = await new Promise((res) => {
    ch.subscribe((s) => {
      if (s === "SUBSCRIBED") res("SUBSCRIBED");
      if (s === "CHANNEL_ERROR") res("CHANNEL_ERROR");
      if (s === "TIMED_OUT") res("TIMED_OUT");
    });
    setTimeout(() => res("JOIN_TIMEOUT"), 10000);
  });

  // the browser race: token only lands AFTER the channel already joined on anon.
  if (order === "after") {
    await sleep(300);
    await maybeAwait(client.realtime.setAuth(ACCESS));
    await sleep(500);
  }

  await sleep(300);
  await insertProbe(name);
  await sleep(WAIT_MS);

  await client.removeChannel(ch);
  await maybeAwait(client.realtime.disconnect?.());
  console.log(
    `trial ${name.padEnd(14)} join=${status.padEnd(12)} received=${received}`,
  );
  return { name, status, received };
}

// the long-open-tab case: an authed channel is live and delivering, then the jwt
// is refreshed (supabase-js calls realtime.setAuth on the already-joined channel).
// does delivery survive? returns counts before + after the refresh.
async function trialRefresh(name) {
  const client = createClient(SUPA_URL, ANON, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  let received = 0;
  await maybeAwait(client.realtime.setAuth(ACCESS));
  const ch = client
    .channel(`probe-${name}-${Date.now()}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "gc_unibox_messages" },
      () => {
        received++;
      },
    );
  await new Promise((res) => {
    ch.subscribe((s) => {
      if (s === "SUBSCRIBED" || s === "CHANNEL_ERROR" || s === "TIMED_OUT") {
        res(s);
      }
    });
    setTimeout(() => res("JOIN_TIMEOUT"), 10000);
  });

  // baseline: delivery works pre-refresh.
  await sleep(300);
  await insertProbe(`${name}-pre`);
  await sleep(WAIT_MS);
  const pre = received;

  // refresh the jwt on the SAME live channel, exactly like a token rotation.
  const fresh = await mintSession();
  await maybeAwait(client.realtime.setAuth(fresh.access_token));
  await sleep(800);
  await insertProbe(`${name}-post`);
  await sleep(WAIT_MS);
  const post = received - pre;

  await client.removeChannel(ch);
  await maybeAwait(client.realtime.disconnect?.());
  console.log(
    `trial ${name.padEnd(14)} pre-refresh=${pre} post-refresh=${post}`,
  );
  return { name, pre, post };
}

console.log(`\nrunning trials (insert -> wait ${WAIT_MS}ms each)\n`);
const a = await trial("A-anon", "none");
const b = await trial("B-auth-first", "before");
const c = await trial("C-auth-after", "after");
const d = await trial("D-hook-path", "hook");
const e = await trialRefresh("E-refresh");

// --- cleanup every row we wrote ---
if (insertedKeys.length) {
  await admin
    .from("gc_unibox_messages")
    .delete()
    .in("message_id_header", insertedKeys);
}
if (createdThread && threadId) {
  await admin.from("gc_unibox_threads").delete().eq("id", threadId);
}
if (createdContactId) {
  await admin.from("gc_contacts").delete().eq("id", createdContactId);
}
console.log("\ncleaned up probe rows.");

// --- verdict ---
console.log("\n=== truth table ===");
console.log(`A anon (expect 0):          ${a.received}`);
console.log(`B setAuth->subscribe:       ${b.received}`);
console.log(`C subscribe->setAuth (bug): ${c.received}`);
console.log(`D shipped hook path:        ${d.received}`);
console.log(`E refresh: pre=${e.pre} post=${e.post}  (post 0 => token-refresh drops live delivery)`);

const aOk = a.received === 0;
const bOk = b.received >= 1;
const dOk = d.received >= 1;
let conclusion;
if (!bOk) {
  conclusion =
    "FAIL: authed client got NO event. realtime infra issue (publication / rls / egress), not an ordering bug.";
} else if (!aOk) {
  conclusion =
    "WARN: anon client received an event ... rls is NOT scoping realtime. investigate policies.";
} else if (!dOk) {
  conclusion =
    "FAIL: the shipped hook path (D) did NOT deliver. the fix is wrong ... investigate.";
} else if (c.received === 0) {
  conclusion =
    "CONFIRMED + FIX VERIFIED: C (the old subscribe-then-setAuth path) drops events; B and D (setAuth-before-subscribe, the shipped hook) deliver. authenticating the socket before joining is the fix.";
} else {
  conclusion =
    "OK: every authed ordering delivers. infra sound; the shipped hook (D) delivers, so the live push works.";
}
console.log(`\n${conclusion}`);

// pass only when rls scopes anon (A=0), a bare authed join delivers (B), and the
// exact shipped hook sequence delivers (D).
process.exit(aOk && bOk && dOk ? 0 : 1);
