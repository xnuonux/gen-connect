import {
  extractEmail,
  threadIdFromAddressTag,
  threadIdFromMessageId,
} from "@/lib/email/thread-token";

// the stable inbound shape the webhook works against, mapped from whatever a
// provider (resend inbound) hands us. pure ... no i/o, fully testable.
export type InboundEmail = {
  fromEmail: string | null;
  fromName: string | null;
  toAddresses: string[];
  subject: string | null;
  text: string;
  providerId: string | null; // dedupe key for the webhook
  messageId: string | null; // the inbound's own Message-ID header
  inReplyTo: string | null;
  references: string[];
};

function asString(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

// resend hands "from"/"to" as either a bare string, a "Name <e@x>" string, or
// an object/array of objects. coerce any of those to a flat string list.
function asAddressList(v: unknown): string[] {
  if (typeof v === "string") return [v];
  if (Array.isArray(v)) {
    return v
      .map((e) =>
        typeof e === "string"
          ? e
          : e && typeof e === "object" && "address" in e
            ? asString((e as Record<string, unknown>).address)
            : null,
      )
      .filter((s): s is string => !!s);
  }
  if (v && typeof v === "object" && "address" in v) {
    const a = asString((v as Record<string, unknown>).address);
    return a ? [a] : [];
  }
  return [];
}

// headers can arrive as an array of {name,value} or a flat object. read one by
// case-insensitive name.
function headerValue(payload: Record<string, unknown>, name: string): string | null {
  const target = name.toLowerCase();
  const direct = asString(payload[name]) ?? asString(payload[target]);
  if (direct) return direct;
  const headers = payload.headers;
  if (Array.isArray(headers)) {
    for (const h of headers) {
      if (h && typeof h === "object") {
        const hn = asString((h as Record<string, unknown>).name);
        if (hn && hn.toLowerCase() === target) {
          return asString((h as Record<string, unknown>).value);
        }
      }
    }
  } else if (headers && typeof headers === "object") {
    const obj = headers as Record<string, unknown>;
    for (const k of Object.keys(obj)) {
      if (k.toLowerCase() === target) return asString(obj[k]);
    }
  }
  return null;
}

function splitReferences(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(/\s+/)
    .map((s) => s.trim())
    .filter((s) => s.includes("@"));
}

// map a resend inbound payload (the `data` object, or the whole body when there
// is no envelope) to the stable shape. defensive about field-name drift.
export function normalizeInbound(input: unknown): InboundEmail {
  const root = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  // unwrap a {type, data} envelope if present.
  const data =
    root.data && typeof root.data === "object"
      ? (root.data as Record<string, unknown>)
      : root;

  const fromRaw = asAddressList(data.from)[0] ?? null;
  const toAddresses = asAddressList(data.to)
    .concat(asAddressList(data.cc))
    .map((a) => extractEmail(a) ?? a.toLowerCase().trim())
    .filter(Boolean);

  const text =
    asString(data.text) ??
    asString(data.text_body) ??
    asString(data.plain) ??
    "";

  return {
    fromEmail: fromRaw ? extractEmail(fromRaw) : null,
    fromName: fromRaw ? fromRaw.replace(/<[^>]+>/, "").trim() || null : null,
    toAddresses,
    subject: asString(data.subject),
    text,
    providerId:
      asString(data.email_id) ??
      asString(data.id) ??
      headerValue(data, "Message-ID"),
    messageId: headerValue(data, "Message-ID") ?? asString(data.message_id),
    inReplyTo: headerValue(data, "In-Reply-To") ?? asString(data.in_reply_to),
    references: splitReferences(
      headerValue(data, "References") ?? asString(data.references),
    ),
  };
}

// trim quoted history + the signature so the stored reply is just the new words.
// conservative: cut at the FIRST recognized reply separator, keep everything
// above it. an over-aggressive stripper that eats real content is worse than a
// little quoted tail, so the patterns are deliberately narrow.
export function stripQuotedReply(text: string): string {
  if (!text) return "";
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  const onWrote = /^\s*on .+wrote:\s*$/i;
  const origMsg = /^\s*-{2,}\s*original message\s*-{2,}\s*$/i;
  const outlookDivider = /^\s*_{10,}\s*$/;
  const headerFrom = /^\s*from:\s.+/i;
  for (const line of lines) {
    if (
      onWrote.test(line) ||
      origMsg.test(line) ||
      outlookDivider.test(line) ||
      headerFrom.test(line) ||
      line.trim() === ">" ||
      /^\s*>/.test(line)
    ) {
      break;
    }
    out.push(line);
  }
  return out.join("\n").trim() || text.trim();
}

// the ordered list of threadIds to try, most-trusted first: the signed reply-to
// token (tamper-proof), then in-reply-to / references that embed our message-id
// (unsigned, so the route still confirms ownership). the route validates each
// against the db and takes the first real hit; if none match it falls back to a
// from-email contact lookup.
export function candidateThreadIds(email: InboundEmail): string[] {
  const out: string[] = [];
  for (const to of email.toAddresses) {
    const t = threadIdFromAddressTag(to);
    if (t) out.push(t);
  }
  const refs = [email.inReplyTo, ...email.references].filter(
    (r): r is string => !!r,
  );
  for (const r of refs) {
    const t = threadIdFromMessageId(r);
    if (t) out.push(t);
  }
  return [...new Set(out)];
}
