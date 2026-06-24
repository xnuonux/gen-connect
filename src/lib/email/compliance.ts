import { createHmac } from "node:crypto";

// can-spam + the 2024 google/yahoo/microsoft bulk-sender rules, as code. every
// send carries a one-click unsubscribe (rfc 8058) and cold first-touches carry
// a physical-address footer. the unsubscribe token is stateless + signed so the
// public endpoint can honor it without a session.
const SECRET =
  process.env.GEN_UNSUB_SECRET ??
  process.env.GEN_THREAD_SECRET ??
  "gen-connect-unsub-v1";

export const PUBLIC_BASE_URL = (
  process.env.GEN_PUBLIC_URL ??
  process.env.NEXT_PUBLIC_SITE_URL ??
  "https://gen.lunari.pro"
).replace(/\/$/, "");

function sig(payload: string): string {
  return createHmac("sha256", SECRET).update(payload).digest("base64url").slice(0, 16);
}

// "<b64url(userId|email)>.<sig>". stateless, tamper-proof, no db lookup needed.
export function signUnsubToken(userId: string, email: string): string {
  const payload = Buffer.from(`${userId}|${email.toLowerCase()}`).toString("base64url");
  return `${payload}.${sig(payload)}`;
}

export function verifyUnsubToken(
  token: string,
): { userId: string; email: string } | null {
  const dot = token.lastIndexOf(".");
  if (dot < 1) return null;
  const payload = token.slice(0, dot);
  const given = token.slice(dot + 1);
  if (sig(payload) !== given) return null;
  const decoded = Buffer.from(payload, "base64url").toString("utf8");
  const bar = decoded.indexOf("|");
  if (bar < 1) return null;
  const userId = decoded.slice(0, bar);
  const email = decoded.slice(bar + 1);
  if (!userId || !email) return null;
  return { userId, email };
}

function unsubUrl(userId: string, email: string): string {
  return `${PUBLIC_BASE_URL}/api/unsubscribe?t=${encodeURIComponent(signUnsubToken(userId, email))}`;
}

// rfc 8058 one-click headers ... both an https POST endpoint and a mailto, plus
// the post directive so gmail/yahoo render the native unsubscribe button. these
// go on EVERY send (gmail/yahoo require the one-click form for bulk mail since
// june 2024; mailto alone fails).
export function unsubscribeHeaders(
  userId: string,
  email: string,
): Record<string, string> {
  const mailto = process.env.GEN_UNSUB_MAILTO ?? "unsubscribe@lunari.pro";
  return {
    "List-Unsubscribe": `<${unsubUrl(userId, email)}>, <mailto:${mailto}?subject=unsubscribe>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}

// the can-spam footer for cold mail: a working opt-out link + the sender's
// physical postal address (GEN_POSTAL_ADDRESS). appended to cold first-touches
// only ... never to a 1:1 reply, which is relationship mail, not bulk.
export function canSpamFooter(userId: string, email: string): string {
  const lines = ["", "...", `not a fit? unsubscribe here: ${unsubUrl(userId, email)}`];
  const postal = process.env.GEN_POSTAL_ADDRESS?.trim();
  if (postal) lines.push(postal);
  return lines.join("\n");
}
