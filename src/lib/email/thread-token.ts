import { createHmac } from "node:crypto";

// threading lives in the address, not a database column. every outbound email
// carries a signed reply-to token ("gen+t.<threadId>.<sig>@lunari.pro") so an
// inbound reply routes deterministically back to its thread, and a stable
// message-id that embeds the same threadId as a secondary anchor for clients
// that echo in-reply-to / references.
//
// the secret is a dedicated GEN_THREAD_SECRET ... NOT the resend webhook secret
// (different trust boundary). the dev fallback is safe: the token only routes a
// reply to a thread the user already owns, and rls still gates every read.
const SECRET = process.env.GEN_THREAD_SECRET ?? "gen-connect-thread-routing-v1";

const UUID = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";

function sig(threadId: string): string {
  return createHmac("sha256", SECRET).update(threadId).digest("hex").slice(0, 12);
}

// "t.<threadId>.<sig>" ... the token embedded in the reply-to local part.
export function signThreadToken(threadId: string): string {
  return `t.${threadId}.${sig(threadId)}`;
}

// extract the threadId from a token, or null on any tamper / malformed input.
export function verifyThreadToken(token: string): string | null {
  const m = new RegExp(`^t\\.(${UUID})\\.([0-9a-f]{12})$`).exec(token.trim());
  const threadId = m?.[1];
  const given = m?.[2];
  if (!threadId || !given) return null;
  return sig(threadId) === given ? threadId : null;
}

// pull an email out of "Name <e@x.com>" or a bare address, lowercased.
export function extractEmail(input: string): string | null {
  const angle = /<([^>]+)>/.exec(input);
  const raw = (angle?.[1] ?? input).trim();
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(raw) ? raw.toLowerCase() : null;
}

// derive the tokenized reply-to from the base from-address. "gen <gen@lunari.pro>"
// becomes "gen+t.<id>.<sig>@lunari.pro". any pre-existing +tag is stripped first.
export function buildReplyTo(
  threadId: string,
  fromAddress: string,
): string | null {
  const email = extractEmail(fromAddress);
  if (!email) return null;
  const at = email.lastIndexOf("@");
  const base = email.slice(0, at).split("+")[0];
  const domain = email.slice(at + 1);
  return `${base}+${signThreadToken(threadId)}@${domain}`;
}

// a stable rfc message-id carrying the threadId. "<gc.<threadId>.<nonce>@domain>".
export function buildMessageId(
  threadId: string,
  fromAddress: string,
  nonce: string,
): string {
  const email = extractEmail(fromAddress) ?? "gen@lunari.pro";
  const domain = email.slice(email.lastIndexOf("@") + 1);
  return `<gc.${threadId}.${nonce}@${domain}>`;
}

// recover a threadId from a "+t.<id>.<sig>" address tag, verifying the sig.
export function threadIdFromAddressTag(address: string): string | null {
  const local = address.split("@")[0] ?? "";
  const plus = local.indexOf("+");
  if (plus === -1) return null;
  return verifyThreadToken(local.slice(plus + 1));
}

// recover a threadId from a "gc.<id>.<nonce>" message-id ref (in-reply-to /
// references). this anchor is unsigned, so the route MUST still confirm the
// thread exists + is owned before trusting it ... it only narrows candidates.
export function threadIdFromMessageId(ref: string): string | null {
  const m = new RegExp(`gc\\.(${UUID})\\.`).exec(ref);
  return m?.[1] ?? null;
}
