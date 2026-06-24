import { NextResponse, type NextRequest } from "next/server";
import { verifyUnsubToken } from "@/lib/email/compliance";
import { createAdminClient } from "@/lib/supabase/admin";

// the rfc 8058 one-click unsubscribe endpoint. PUBLIC (no session) ... the token
// is signed + stateless, so we verify it, suppress the address, and log the
// event without auth. a POST is the one-click form gmail/yahoo fire; a GET is
// the human clicking the link in the footer. honored immediately, well inside
// the 2-day window the bulk-sender rules require.
export const runtime = "nodejs";

async function suppress(
  token: string | null,
): Promise<{ ok: boolean; email?: string }> {
  if (!token) return { ok: false };
  const parsed = verifyUnsubToken(token);
  if (!parsed) return { ok: false };
  const admin = createAdminClient();
  if (!admin) return { ok: false };

  const email = parsed.email.toLowerCase();
  const { data: existing } = await admin
    .from("gc_suppression")
    .select("id")
    .eq("user_id", parsed.userId)
    .ilike("email", email)
    .limit(1)
    .maybeSingle();

  if (!existing) {
    await admin.from("gc_suppression").insert({
      user_id: parsed.userId,
      email,
      reason: "unsubscribe",
      source: "one_click",
    });
    await admin.from("gc_deliverability_events").insert({
      user_id: parsed.userId,
      event_type: "unsubscribed",
      email,
      occurred_at: new Date().toISOString(),
    });
  }
  return { ok: true, email };
}

export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  let token = url.searchParams.get("t");
  if (!token) {
    try {
      const form = await req.formData();
      const t = form.get("t");
      token = typeof t === "string" ? t : null;
    } catch {
      // no form body ... fall through with a null token.
    }
  }
  const r = await suppress(token);
  return NextResponse.json({ ok: r.ok }, { status: r.ok ? 200 : 400 });
}

export async function GET(req: NextRequest) {
  const token = new URL(req.url).searchParams.get("t");
  const r = await suppress(token);
  const msg = r.ok
    ? "you're unsubscribed. you won't hear from us again."
    : "this unsubscribe link is invalid or expired.";
  return new NextResponse(page(msg), {
    status: r.ok ? 200 : 400,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

// a tiny on-brand confirmation page (standalone ... no app shell, inline styles).
function page(message: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>unsubscribe</title></head>
<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#08090e;color:#f5ead8;font-family:ui-sans-serif,system-ui,-apple-system,sans-serif">
<div style="max-width:30rem;padding:2.5rem;text-align:center">
<div style="width:8px;height:8px;border-radius:9999px;background:#2d5f3f;margin:0 auto 1.5rem;box-shadow:0 0 24px 2px #2d5f3f"></div>
<p style="font-size:1.05rem;line-height:1.6;margin:0;color:#f5ead8">${message}</p>
</div></body></html>`;
}
