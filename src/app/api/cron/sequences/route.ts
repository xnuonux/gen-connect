import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { advanceDueEnrollments } from "@/lib/sequences/runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// the autonomous sequence executor ... the scheduled twin of the in-app "run due
// sends" button. a scheduler (a netlify scheduled function, a vercel cron, or any
// external cron) hits this on a cadence with the shared secret; we page the distinct
// users who have active enrollments and run the SAME advanceDueEnrollments per user
// through the service-role client (rls is bypassed, so every query inside the runner
// is scoped by user_id explicitly). the double-send guard (per-step compare-and-set)
// is what makes this safe to overlap a manual tick.
//
// test-mode-safe by construction: guardedSend still redirects every send to the test
// inbox unless GEN_SEND_MODE=live on a verified domain. going live is one env var on
// the deploy ... never a code change here.
//
// double-gated like every trusted server entrypoint: it 404s unless CRON_SECRET is
// set AND the caller presents it (constant-time compare). no secret => never runs. to
// schedule it, point your cron at POST /api/cron/sequences with
//   authorization: Bearer $CRON_SECRET   (or the x-cron-secret header)
// e.g. a netlify scheduled function fetching this url every 15 minutes.

function authorized(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false; // not configured ... the cron stays dark
  const header =
    req.headers
      .get("authorization")
      ?.replace(/^Bearer\s+/i, "")
      .trim() ??
    req.headers.get("x-cron-secret")?.trim() ??
    "";
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  // length check first ... timingSafeEqual throws on a length mismatch.
  if (a.length === 0 || a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

async function tick(req: NextRequest): Promise<NextResponse> {
  if (!authorized(req)) {
    return new NextResponse("not found", { status: 404 });
  }
  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      {
        ok: false,
        error: "service role not configured ... set SUPABASE_SERVICE_ROLE_KEY.",
      },
      { status: 501 },
    );
  }

  // distinct users with at least one active enrollment. this MUST be a distinct-user
  // query (the gc_active_enrollment_users rpc), not a paged row select ... paging
  // gc_sequence_enrollments rows hits postgrest's max-rows cap, so one high-volume
  // tenant's rows fill the window and every other tenant is silently never ticked.
  // the rpc is execute-restricted to service_role (v0_1_18) and returns only ids.
  const { data, error } = await admin.rpc("gc_active_enrollment_users");
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  const userIds = [
    ...new Set(((data ?? []) as { user_id: string }[]).map((r) => r.user_id)),
  ];

  const totals = {
    users: 0,
    scanned: 0,
    sent: 0,
    completed: 0,
    failed: 0,
    skipped: 0,
  };
  for (const userId of userIds) {
    try {
      const r = await advanceDueEnrollments({ db: admin, userId });
      totals.users += 1;
      totals.scanned += r.scanned;
      totals.sent += r.sent;
      totals.completed += r.completed;
      totals.failed += r.failed;
      totals.skipped += r.skipped;
    } catch (e) {
      // one user's failure never stops the sweep for the rest.
      console.error("[cron/sequences] user tick failed", userId, e);
    }
  }

  const mode = process.env.GEN_SEND_MODE === "live" ? "live" : "test";
  return NextResponse.json({ ok: true, mode, ...totals });
}

// POST is the canonical entrypoint; GET is accepted too so cron providers that only
// issue GET (e.g. vercel cron) work without a shim. the secret gate is identical.
export async function POST(req: NextRequest) {
  return tick(req);
}
export async function GET(req: NextRequest) {
  return tick(req);
}
