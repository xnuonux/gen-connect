import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  BOOKING_CREATED,
  normalizeCalcomPayload,
  pickContactMatch,
  resolveBookingEmails,
  verifyCalcomSignature,
} from "@/lib/calcom/booking";
import {
  findContactsByEmailService,
  updateContactStageService,
} from "@/lib/supabase/contacts";
import { recordOutcomeService } from "@/lib/supabase/outcomes";

// the cal.com booking webhook. the user shares their cal.com link in outreach
// (saved in the unibox); a lead picks a slot, cal.com fires BOOKING_CREATED,
// and the matching contact moves to booked + a meeting_booked outcome lands ...
// the exact effect of the unibox's "mark booked" button, no human click.
// needs node (crypto + raw body).
//
// gated like the sequences cron: no CALCOM_WEBHOOK_SECRET => the hook stays
// dark (404). a present-but-wrong signature 401s before we trust a byte.
// every decision the handler makes lives in the pure layer (lib/calcom/booking)
// so test/pure.ts covers it.
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const secret = process.env.CALCOM_WEBHOOK_SECRET;
  if (!secret) {
    // not configured ... the hook stays dark, same as the cron's secret gate.
    return new NextResponse("not found", { status: 404 });
  }

  const raw = await req.text();
  if (
    !verifyCalcomSignature(secret, req.headers.get("x-cal-signature-256"), raw)
  ) {
    return NextResponse.json(
      { ok: false, error: "bad signature" },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false, error: "bad json" }, { status: 400 });
  }

  const booking = normalizeCalcomPayload(body);
  if (!booking) {
    return NextResponse.json(
      { ok: false, error: "bad payload" },
      { status: 400 },
    );
  }

  // only a fresh booking moves the pipeline; every other trigger event 200s so
  // cal.com does not retry a payload we will never use.
  if (booking.triggerEvent !== BOOKING_CREATED) {
    return NextResponse.json({ ok: true, ignored: booking.triggerEvent });
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

  try {
    // the booked contact is the attendee who is NOT the organizer (the
    // organizer is the gen connect user ... their own email must never mark
    // one of their contacts booked).
    const emails = resolveBookingEmails(
      booking.attendeeEmails,
      booking.organizerEmail,
    );

    const matches = [];
    for (const email of emails) {
      matches.push(...(await findContactsByEmailService(admin, email)));
    }
    // one contact can match through several attendee emails ... dedupe on id.
    const picked = pickContactMatch([
      ...new Map(matches.map((m) => [m.id, m])).values(),
    ]);
    if (!picked) {
      // a booking for someone we have no contact for ... 200, nothing to do.
      return NextResponse.json({ ok: true, matched: false });
    }
    if (picked.ambiguous) {
      console.warn(
        "[calcom] booking matched contacts in several workspaces ... picked the most recently updated",
        { contactId: picked.match.id, userId: picked.match.userId, emails },
      );
    }

    // the same two writes the manual "mark booked" button makes.
    await updateContactStageService(admin, picked.match.id, "booked");
    const outcome = await recordOutcomeService(admin, picked.match.userId, {
      contactId: picked.match.id,
      eventType: "meeting_booked",
      dollarValue: 0,
      note: booking.startTime
        ? `booked via cal.com ... starts ${booking.startTime}`
        : "booked via cal.com",
    });
    if (!outcome.ok) {
      console.error("[calcom] outcome log failed", outcome.error);
    }

    return NextResponse.json({
      ok: true,
      matched: true,
      contactId: picked.match.id,
    });
  } catch (err) {
    // a verified event whose handler hit a transient db blip ... 200 so cal.com
    // does not hammer retries; a manual replay reconciles (same posture as the
    // stripe webhook).
    console.error("[calcom] booking handling failed", err);
    return NextResponse.json({ received: true, handled: false });
  }
}
