import { NextResponse, type NextRequest } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { normalizeInbound } from "@/lib/unibox/threading";
import { ingestInbound, ingestDeliverabilityEvent } from "@/lib/unibox/inbound";
import { mapResendEventType } from "@/lib/deliverability/rate";

// the inbound + events webhook. resend signs with svix; we verify the signature
// before trusting a byte. inbound replies thread into the unibox; sending events
// (delivered / bounced / complained / ...) feed the deliverability ledger, the
// suppression list, and the auto-pause guard. needs node (crypto + raw body).
export const runtime = "nodejs";

// svix scheme: hmac-sha256 over "<id>.<timestamp>.<rawBody>" keyed on the
// base64 secret after the "whsec_" prefix; the header is a space-separated list
// of "v1,<b64sig>" ... a match on any entry passes.
function verifySvix(
  secret: string,
  id: string | null,
  timestamp: string | null,
  signatureHeader: string | null,
  rawBody: string,
): boolean {
  if (!id || !timestamp || !signatureHeader) return false;
  // reject a stale or replayed timestamp (the svix scheme mandates a tolerance;
  // 5 minutes is the default). blocks replay of a captured-but-valid payload.
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 300) return false;
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key)
    .update(`${id}.${timestamp}.${rawBody}`)
    .digest("base64");
  const expectedBuf = Buffer.from(expected);
  return signatureHeader
    .split(" ")
    .map((part) => part.split(",")[1])
    .filter((s): s is string => !!s)
    .some((candidate) => {
      const candBuf = Buffer.from(candidate);
      return (
        candBuf.length === expectedBuf.length &&
        timingSafeEqual(candBuf, expectedBuf)
      );
    });
}

function firstRecipient(to: unknown): string | null {
  if (typeof to === "string") return to.toLowerCase();
  if (Array.isArray(to) && typeof to[0] === "string") return to[0].toLowerCase();
  return null;
}

export async function POST(req: NextRequest) {
  const raw = await req.text();
  const secret = process.env.RESEND_WEBHOOK_SECRET;

  if (secret) {
    const ok = verifySvix(
      secret,
      req.headers.get("svix-id"),
      req.headers.get("svix-timestamp"),
      req.headers.get("svix-signature"),
      raw,
    );
    if (!ok) {
      return NextResponse.json({ ok: false, error: "bad signature" }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === "production") {
    // never trust an unsigned webhook in production.
    return NextResponse.json(
      { ok: false, error: "webhook secret not configured" },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false, error: "bad json" }, { status: 400 });
  }

  const obj = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const type = typeof obj.type === "string" ? obj.type : "";

  // inbound reply: an inbound/received event type.
  if (type === "email.received" || type === "inbound.email" || type.startsWith("inbound")) {
    const res = await ingestInbound(normalizeInbound(body));
    return NextResponse.json({ ok: true, matched: res.matched });
  }

  // a sending event: map it and feed the deliverability pipeline.
  const mapped = mapResendEventType(type);
  if (mapped) {
    const data = (obj.data && typeof obj.data === "object"
      ? obj.data
      : {}) as Record<string, unknown>;
    const externalId =
      typeof data.email_id === "string"
        ? data.email_id
        : typeof data.id === "string"
          ? data.id
          : null;
    // a transient / soft bounce (mailbox full, greylisting, deferred) must NOT
    // permanently suppress a valid address or inflate the hard-bounce rate. only
    // an explicit Permanent bounce is a hard bounce; anything else logs as a
    // non-suppressing delivery_delayed.
    let eventType = mapped;
    if (mapped === "bounced") {
      const bounce = (data.bounce && typeof data.bounce === "object"
        ? data.bounce
        : {}) as Record<string, unknown>;
      const bounceType = typeof bounce.type === "string" ? bounce.type : "";
      if (!/permanent/i.test(bounceType)) eventType = "delivery_delayed";
    }
    const res = await ingestDeliverabilityEvent({
      eventType,
      externalId,
      recipientEmail: firstRecipient(data.to),
      messageId: typeof data.message_id === "string" ? data.message_id : null,
      raw: obj,
    });
    return NextResponse.json({ ok: true, matched: res.matched });
  }

  // unknown event ... 200 so resend doesn't retry a payload we will never use.
  return NextResponse.json({ ok: true, ignored: type || "unknown" });
}

// a plain probe for setup checks.
export async function GET() {
  return NextResponse.json({ ok: true, hook: "resend" });
}
