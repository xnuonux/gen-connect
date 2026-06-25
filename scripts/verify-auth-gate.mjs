// auth-gate proof: does proxy.ts actually BLOCK an unauthenticated request to
// every protected route, not just "is it wired"? this is the security boundary
// both versions ride on, so prove it over real http against the dev server.
//
// run (dev server up on BASE): node scripts/verify-auth-gate.mjs
//
// it checks: (1) every protected prefix, hit with NO session, 307-redirects to
// /login; (2) a public route is NOT bounced; (3) bonus ... if dev-login is
// reachable, a session cookie lets a protected route through (200, no redirect).

const BASE = process.env.VERIFY_BASE_URL ?? "http://localhost:3001";

// must mirror PROTECTED_PREFIXES in src/lib/supabase/middleware.ts
const PROTECTED = [
  "/pipeline",
  "/unibox",
  "/signals",
  "/campaigns",
  "/triggers",
  "/sequences",
  "/deliverability",
  "/gen",
  "/draft",
  "/onboarding",
  "/billing",
];

let fails = 0;
function ok(name, cond, extra) {
  if (cond) console.log(`  ok   ${name}`);
  else {
    fails++;
    console.error(`  FAIL ${name}`, extra ?? "");
  }
}

function redirectsToLogin(res) {
  if (res.status !== 307 && res.status !== 308 && res.status !== 302) return false;
  const loc = res.headers.get("location") ?? "";
  return loc.includes("/login");
}

console.log(`auth gate target: ${BASE}\n`);

// --- 1. every protected prefix bounces an unauthenticated request to /login ---
for (const path of PROTECTED) {
  // test the bare prefix AND a sub-path (the gate matches both forms)
  for (const p of [path, `${path}/probe`]) {
    let res;
    try {
      res = await fetch(`${BASE}${p}`, { method: "GET", redirect: "manual" });
    } catch (e) {
      console.error(`  could not reach ${BASE}${p}:`, e.message);
      process.exit(2);
    }
    ok(`unauth ${p} -> /login`, redirectsToLogin(res), `status=${res.status} loc=${res.headers.get("location")}`);
  }
}

// --- 2. a public route is NOT gated ---
{
  const res = await fetch(`${BASE}/login`, { method: "GET", redirect: "manual" });
  ok("public /login is not bounced", !redirectsToLogin(res), `status=${res.status} loc=${res.headers.get("location")}`);
}

// --- 3. bonus: a real session gets through (also proves dev-login works) ---
try {
  const login = await fetch(`${BASE}/api/dev-login`, { method: "GET", redirect: "manual" });
  const setCookies = login.headers.getSetCookie?.() ?? [];
  const cookieHeader = setCookies
    .map((c) => c.split(";")[0])
    .filter((c) => c.startsWith("sb-"))
    .join("; ");
  if (!cookieHeader) {
    console.log("  skip authed pass-through (dev-login set no sb- cookies ... disabled or env-less)");
  } else {
    const res = await fetch(`${BASE}/pipeline`, {
      method: "GET",
      redirect: "manual",
      headers: { cookie: cookieHeader },
    });
    // signed in: /pipeline should NOT bounce to /login (200, or a non-login redirect)
    ok("authed /pipeline is allowed through", !redirectsToLogin(res), `status=${res.status} loc=${res.headers.get("location")}`);
    // the billing page must actually RENDER for a signed-in user (200), not just
    // pass the gate ... a 200 proves the new route compiles + server-renders.
    const billing = await fetch(`${BASE}/billing`, {
      method: "GET",
      redirect: "manual",
      headers: { cookie: cookieHeader },
    });
    ok("authed /billing renders (200)", billing.status === 200, `status=${billing.status}`);
  }
} catch (e) {
  console.log("  skip authed pass-through:", e.message);
}

console.log(`\n${fails === 0 ? "PASS" : "FAIL"}: auth gate blocks the workspace from anonymous access (${fails} failures)`);
process.exit(fails === 0 ? 0 : 1);
