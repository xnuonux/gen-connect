import {
  signThreadToken,
  verifyThreadToken,
  buildReplyTo,
  buildMessageId,
  threadIdFromAddressTag,
  threadIdFromMessageId,
  extractEmail,
} from "../src/lib/email/thread-token.ts";
import {
  normalizeInbound,
  stripQuotedReply,
  candidateThreadIds,
} from "../src/lib/unibox/threading.ts";
import {
  shouldAutoPause,
  mapResendEventType,
  suppressionReasonFor,
} from "../src/lib/deliverability/rate.ts";
import {
  signUnsubToken,
  verifyUnsubToken,
  unsubscribeHeaders,
  canSpamFooter,
} from "../src/lib/email/compliance.ts";
import {
  jurisdictionGate,
  normalizeCountry,
} from "../src/lib/deliverability/jurisdiction.ts";
import { secretIsTrustworthy } from "../src/lib/email/secret.ts";
import { presendVerdict } from "../src/lib/deliverability/presend.ts";
import { normalizeDomain, expectedRecords, parseDmarcPolicy } from "../src/lib/deliverability/dns.ts";
import { parseResendDomain, resendVerified } from "../src/lib/deliverability/resend-domains.ts";

let pass = 0;
let fail = 0;
function ok(name: string, cond: boolean, extra?: unknown) {
  if (cond) {
    pass++;
  } else {
    fail++;
    console.error(`  FAIL: ${name}`, extra ?? "");
  }
}

const TID = "11111111-2222-4333-8444-555555555555";
const FROM = "gen <gen@lunari.pro>";

// --- thread-token ---
const tok = signThreadToken(TID);
ok("token round-trips", verifyThreadToken(tok) === TID, tok);
ok("tampered sig rejected", verifyThreadToken(`t.${TID}.deadbeefdead`) === null);
ok("garbage token rejected", verifyThreadToken("nonsense") === null);

const replyTo = buildReplyTo(TID, FROM);
ok("reply-to shape", replyTo === `gen+${tok}@lunari.pro`, replyTo);
ok("reply-to round-trips", threadIdFromAddressTag(replyTo!) === TID);
ok(
  "address tag tamper rejected",
  threadIdFromAddressTag(`gen+t.${TID}.0000deadbeef@lunari.pro`) === null,
);

const mid = buildMessageId(TID, FROM, "abc123");
ok("message-id shape", mid === `<gc.${TID}.abc123@lunari.pro>`, mid);
ok("message-id round-trips", threadIdFromMessageId(mid) === TID);

ok("extractEmail from name", extractEmail("Marisol <m@x.io>") === "m@x.io");
ok("extractEmail bare", extractEmail("M@X.IO") === "m@x.io");
ok("extractEmail junk", extractEmail("not an email") === null);

// --- threading: normalizeInbound (resend envelope) ---
const payload = {
  type: "email.received",
  data: {
    from: "Marisol Chen <marisol@northbound.studio>",
    to: [`gen+${tok}@lunari.pro`],
    subject: "re: your note",
    text: "yeah tuesday works\n\nOn Mon, Jun 9 2026, gen wrote:\n> the original\n> pitch body",
    email_id: "re_inbound_9981",
    headers: [
      { name: "Message-ID", value: "<reply-xyz@northbound.studio>" },
      { name: "In-Reply-To", value: mid },
      { name: "References", value: `<other@x> ${mid}` },
    ],
  },
};
const inb = normalizeInbound(payload);
ok("inbound from", inb.fromEmail === "marisol@northbound.studio", inb.fromEmail);
ok("inbound fromName", inb.fromName === "Marisol Chen", inb.fromName);
ok("inbound to carries token", inb.toAddresses[0] === `gen+${tok}@lunari.pro`);
ok("inbound subject", inb.subject === "re: your note");
ok("inbound providerId", inb.providerId === "re_inbound_9981", inb.providerId);
ok("inbound inReplyTo", inb.inReplyTo === mid, inb.inReplyTo);
ok("inbound references parsed", inb.references.length === 2, inb.references);

// stripQuotedReply keeps the new words, drops the quoted block
const stripped = stripQuotedReply(inb.text);
ok("strip keeps new reply", stripped === "yeah tuesday works", JSON.stringify(stripped));

// candidateThreadIds: token first, ref second, deduped
const cands = candidateThreadIds(inb);
ok("candidate token first", cands[0] === TID, cands);
ok("candidates deduped to one", cands.length === 1, cands);

// flat payload (no envelope, no headers array)
const flat = normalizeInbound({
  from: "a@b.com",
  to: "gen@lunari.pro",
  subject: "hi",
  text: "hello",
  message_id: "<m1@b.com>",
});
ok("flat normalizes", flat.fromEmail === "a@b.com" && flat.text === "hello");

// --- rate ---
ok("below floor no pause", shouldAutoPause({ sent: 5, complaints: 5, bounces: 0 }).pause === false);
ok(
  "complaint over 0.1% pauses",
  shouldAutoPause({ sent: 1000, complaints: 2, bounces: 0 }).pause === true,
);
ok(
  "complaint under 0.1% holds",
  shouldAutoPause({ sent: 1000, complaints: 0, bounces: 0 }).pause === false,
);
ok(
  "bounce over 5% pauses",
  shouldAutoPause({ sent: 100, complaints: 0, bounces: 6 }).pause === true,
);
ok("map sent", mapResendEventType("email.bounced") === "bounced");
ok("map unknown null", mapResendEventType("email.whatever") === null);
ok("suppress bounce", suppressionReasonFor("bounced") === "hard_bounce");
ok("suppress complaint", suppressionReasonFor("complained") === "complaint");
ok("no-suppress delivered", suppressionReasonFor("delivered") === null);

// --- compliance: unsubscribe token + rfc 8058 headers + footer ---
const UID = "af0fb4d5-c941-445e-84e8-61fabfd30615";
const utok = signUnsubToken(UID, "Lead@Example.com");
const uv = verifyUnsubToken(utok);
ok("unsub token round-trips + lowercases", uv?.userId === UID && uv?.email === "lead@example.com", uv);
ok("unsub tamper rejected", verifyUnsubToken(`${utok.slice(0, -2)}zz`) === null);
ok("unsub garbage rejected", verifyUnsubToken("nope") === null);

const uh = unsubscribeHeaders(UID, "lead@example.com");
ok("one-click post header", uh["List-Unsubscribe-Post"] === "List-Unsubscribe=One-Click");
ok(
  "list-unsubscribe has https + mailto",
  /^<https:\/\/[^>]+\/api\/unsubscribe\?t=[^>]+>, <mailto:[^>]+>$/.test(
    uh["List-Unsubscribe"] ?? "",
  ),
  uh["List-Unsubscribe"],
);
const footer = canSpamFooter(UID, "lead@example.com");
ok("footer carries the unsubscribe url", footer.includes("/api/unsubscribe?t="), footer);

// --- jurisdiction hard-gate ---
ok("normalizeCountry iso", normalizeCountry("de") === "DE");
ok("normalizeCountry name", normalizeCountry("Germany") === "DE");
ok("normalizeCountry unknown", normalizeCountry("Atlantis") === null);
ok("cold to DE blocked", jurisdictionGate({ country: "DE", kind: "cold" }).allow === false);
ok("cold to DE w/ consent allowed", jurisdictionGate({ country: "DE", kind: "cold", consent: true }).allow === true);
ok("reply to DE allowed", jurisdictionGate({ country: "DE", kind: "reply" }).allow === true);
ok("cold to FR allowed", jurisdictionGate({ country: "France", kind: "cold" }).allow === true);
ok("cold to US allowed", jurisdictionGate({ country: "US", kind: "cold" }).allow === true);
ok("cold unknown country allowed", jurisdictionGate({ country: null, kind: "cold" }).allow === true);

// --- secret posture: fail-closed in production ---
const env = process.env as Record<string, string | undefined>;
const savedNodeEnv = env.NODE_ENV;
env.NODE_ENV = "production";
ok("prod + no secret -> untrustworthy", secretIsTrustworthy(undefined) === false);
ok("prod + real secret -> trustworthy", secretIsTrustworthy("a-real-secret") === true);
env.NODE_ENV = "development";
ok("dev + no secret -> ok (fallback fine)", secretIsTrustworthy(undefined) === true);
env.NODE_ENV = savedNodeEnv;

// --- pre-send verdict ---
ok("presend blocked on suppressed", presendVerdict({ suppressed: true, country: "US", consent: false, kind: "cold" }).status === "blocked");
ok("presend blocked cold DE no consent", presendVerdict({ suppressed: false, country: "DE", consent: false, kind: "cold" }).status === "blocked");
ok("presend ready reply DE", presendVerdict({ suppressed: false, country: "DE", consent: false, kind: "reply" }).status === "ready");
ok("presend warn cold no country", presendVerdict({ suppressed: false, country: null, consent: false, kind: "cold" }).status === "warn");
ok("presend ready cold US", presendVerdict({ suppressed: false, country: "US", consent: false, kind: "cold" }).status === "ready");

// --- dns record advisor ---
ok("normalizeDomain strips https/www/path", normalizeDomain("https://www.Lunari.pro/path") === "lunari.pro");
ok("normalizeDomain keeps bare", normalizeDomain("send.lunari.pro") === "send.lunari.pro");
ok("normalizeDomain rejects junk", normalizeDomain("not a domain") === null);
const recs = expectedRecords("lunari.pro");
ok("records: 4", recs.length === 4);
ok("spf host", recs.find((r) => r.kind === "SPF")?.host === "send.lunari.pro");
ok("spf value", recs.find((r) => r.kind === "SPF")?.value === "v=spf1 include:amazonses.com ~all");
ok("dkim host", recs.find((r) => r.kind === "DKIM")?.host === "resend._domainkey.lunari.pro");
ok(
  "dmarc host + p=none",
  recs.find((r) => r.kind === "DMARC")?.host === "_dmarc.lunari.pro" &&
    (recs.find((r) => r.kind === "DMARC")?.value ?? "").includes("p=none"),
);

// --- dmarc policy parse (boundary-anchored, not fooled by sp=) ---
ok("dmarc p= basic", parseDmarcPolicy("v=DMARC1; p=reject; rua=mailto:x") === "reject");
ok("dmarc sp= first not matched", parseDmarcPolicy("v=DMARC1; sp=reject; p=quarantine") === "quarantine");
ok("dmarc sp=none p=reject", parseDmarcPolicy("v=DMARC1; adkim=s; aspf=s; sp=none; p=reject") === "reject");
ok("dmarc absent -> null", parseDmarcPolicy("v=DMARC1; rua=mailto:x") === null);

// --- resend authoritative domain parse ---
const resendList = {
  object: "list",
  data: [
    { id: "dom_1", name: "lunari.pro", status: "verified" },
    { id: "dom_2", name: "other.com", status: "pending" },
  ],
};
ok("resend finds verified status", parseResendDomain(resendList, "lunari.pro")?.status === "verified");
ok("resend returns id", parseResendDomain(resendList, "lunari.pro")?.id === "dom_1");
ok("resend case-insensitive", parseResendDomain(resendList, "LUNARI.PRO")?.id === "dom_1");
ok("resend not found -> null", parseResendDomain(resendList, "nope.com") === null);
ok("resend bad json -> null", parseResendDomain({}, "lunari.pro") === null);
ok("resendVerified true", resendVerified({ id: "x", status: "verified" }) === true);
ok("resendVerified pending false", resendVerified({ id: "x", status: "pending" }) === false);
ok("resendVerified null false", resendVerified(null) === false);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
