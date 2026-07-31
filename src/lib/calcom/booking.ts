import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

// the pure side of the cal.com booking webhook. everything the route needs to
// decide (signature, payload shape, who the booked contact is) lives here as
// exported pure functions so test/pure.ts covers them without a network.

export const BOOKING_CREATED = "BOOKING_CREATED";

// cal.com signs each delivery with hmac-sha256 over the raw request body, hex
// encoded, keyed on the secret from the webhook's settings page (cal.com
// webhook settings -> secret), delivered in the x-cal-signature-256 header.
// constant-time compare; the length check comes first because timingSafeEqual
// throws on a length mismatch.
export function verifyCalcomSignature(
  secret: string,
  signatureHeader: string | null,
  rawBody: string,
): boolean {
  if (!secret || !signatureHeader) return false;
  const expected = createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("hex");
  const a = Buffer.from(signatureHeader.trim(), "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length === 0 || a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// the slice of a cal.com booking payload we act on. unknown extra fields are
// stripped; a missing attendees array reads as empty rather than failing, since
// cal.com omits it on some trigger events we 200-ignore anyway.
const WebhookSchema = z.object({
  triggerEvent: z.string(),
  payload: z.object({
    attendees: z.array(z.object({ email: z.string() })).catch([]),
    organizer: z.object({ email: z.string() }).partial().optional(),
    startTime: z.string().optional(),
  }),
});

export type CalcomBooking = {
  triggerEvent: string;
  attendeeEmails: string[];
  organizerEmail: string | null;
  startTime: string | null;
};

// parse + normalize one cal.com delivery. returns null when the body is not a
// shape we can trust at all (the route 400s).
export function normalizeCalcomPayload(body: unknown): CalcomBooking | null {
  const parsed = WebhookSchema.safeParse(body);
  if (!parsed.success) return null;
  const { triggerEvent, payload } = parsed.data;
  const organizerEmail = payload.organizer?.email;
  return {
    triggerEvent,
    attendeeEmails: payload.attendees
      .map((a) => a.email.trim().toLowerCase())
      .filter((e) => e.length > 0),
    organizerEmail: organizerEmail ? organizerEmail.trim().toLowerCase() : null,
    startTime: payload.startTime ?? null,
  };
}

// the emails that can identify the BOOKED contact: the attendees, minus the
// organizer. the organizer is the gen connect user themselves ... their own
// email must never mark one of their contacts booked. deduped, order kept.
export function resolveBookingEmails(
  attendeeEmails: string[],
  organizerEmail: string | null,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of attendeeEmails) {
    const email = raw.trim().toLowerCase();
    if (!email || seen.has(email)) continue;
    seen.add(email);
    if (organizerEmail && email === organizerEmail) continue;
    out.push(email);
  }
  return out;
}

export type ContactMatch = { id: string; userId: string; updatedAt: string };

export type PickedMatch = {
  match: ContactMatch;
  // true when the matches span more than one workspace ... the email sits in
  // several users' pipelines, so the pick is a best guess (most recently
  // updated) and the webhook logs the ambiguity.
  ambiguous: boolean;
};

// pick the owning contact from every match across users: the most recently
// updated wins. returns null when nothing matched.
export function pickContactMatch(matches: ContactMatch[]): PickedMatch | null {
  if (matches.length === 0) return null;
  const sorted = [...matches].sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  );
  const winner = sorted[0];
  if (!winner) return null;
  const users = new Set(matches.map((m) => m.userId));
  return { match: winner, ambiguous: users.size > 1 };
}
