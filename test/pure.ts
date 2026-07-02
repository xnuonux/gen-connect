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
import { guardDecision } from "../src/lib/email/guard.ts";
import { planForPriceId, tierForStatus, isPlanKey } from "../src/lib/billing/plans.ts";
import {
  scrubVoice,
  hasForbiddenDash,
  findForbiddenPhrases,
} from "../src/lib/ai/scrub.ts";
import { FORBIDDEN_PHRASES } from "../src/lib/types/draft.ts";
import { flameScore } from "../src/lib/signals/flame.ts";
import { evaluateTrigger } from "../src/lib/triggers/evaluate.ts";
import type { SignalHit, TriggerContact } from "../src/lib/types/signal.ts";
import { validateGraph } from "../src/lib/sequences/validate.ts";
import type { SequenceGraph } from "../src/lib/types/sequence.ts";

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

// --- guarded-send decision core (the gate ordering is safety-critical) ---
const base = {
  suppressed: false,
  isLive: false,
  domainVerified: true,
  fromDomain: "lunari.pro",
  country: null as string | null,
  consent: null as boolean | null,
  kind: "cold" as "cold" | "reply",
};
// each gate fires when it should
ok("guard suppressed blocks", (() => {
  const v = guardDecision({ ...base, suppressed: true });
  return v.allow === false && v.gate === "suppression" && v.suppressed === true && v.mode === "test";
})());
ok("guard live + unverified domain blocks", (() => {
  const v = guardDecision({ ...base, isLive: true, domainVerified: false });
  return v.allow === false && v.gate === "domain" && v.blocked === true && v.mode === "live";
})());
ok("guard test-mode skips domain gate", guardDecision({ ...base, isLive: false, domainVerified: false, country: "US" }).allow === true);
ok("guard live + verified domain + US allows", guardDecision({ ...base, isLive: true, domainVerified: true, country: "US" }).allow === true);
ok("guard cold DE no consent blocks", (() => {
  const v = guardDecision({ ...base, country: "DE" });
  return v.allow === false && v.gate === "jurisdiction" && v.blocked === true && v.mode === "test";
})());
ok("guard cold DE with consent allows", guardDecision({ ...base, country: "DE", consent: true }).allow === true);
ok("guard reply to DE allows", guardDecision({ ...base, country: "DE", kind: "reply" }).allow === true);
ok("guard cold unknown country allows", guardDecision({ ...base, country: null }).allow === true);
// ordering: the earlier gate always wins
ok("guard order: suppression beats jurisdiction", (() => {
  const v = guardDecision({ ...base, suppressed: true, country: "DE" });
  return v.allow === false && v.gate === "suppression";
})());
ok("guard order: domain beats jurisdiction", (() => {
  const v = guardDecision({ ...base, isLive: true, domainVerified: false, country: "DE" });
  return v.allow === false && v.gate === "domain";
})());

// --- billing plan core (the webhook maps prices + statuses through this) ---
const priceMap = { creator: "price_creator_x", pro: "price_pro_y" };
ok("price -> creator", planForPriceId("price_creator_x", priceMap) === "creator");
ok("price -> pro", planForPriceId("price_pro_y", priceMap) === "pro");
ok("unknown price -> null", planForPriceId("price_nope", priceMap) === null);
ok("empty map -> null", planForPriceId("price_creator_x", {}) === null);
ok("isPlanKey creator", isPlanKey("creator") === true);
ok("isPlanKey pro", isPlanKey("pro") === true);
ok("isPlanKey junk", isPlanKey("enterprise") === false);
ok("isPlanKey non-string", isPlanKey(42) === false);
// status -> tier: active/trialing/past_due are paid (past_due = dunning grace),
// everything else is free.
ok("status active -> paid", tierForStatus("active") === "paid");
ok("status trialing -> paid", tierForStatus("trialing") === "paid");
ok("status past_due -> paid (grace)", tierForStatus("past_due") === "paid");
ok("status canceled -> free", tierForStatus("canceled") === "free");
ok("status unpaid -> free", tierForStatus("unpaid") === "free");
ok("status incomplete -> free", tierForStatus("incomplete") === "free");
ok("status paused -> free", tierForStatus("paused") === "free");

// --- scrubVoice: the load-bearing voice guarantee (docs/01-architecture.md) ---
// the dash chars are built from codepoints, never embedded (the voice-check hook
// blocks any source file that contains a literal em-dash, this test included).
const EM = String.fromCharCode(0x2014);
const EN = String.fromCharCode(0x2013);
ok("scrub em-dash -> ...", scrubVoice(`a${EM}b`) === "a...b");
ok("scrub en-dash -> ...", scrubVoice(`a${EN}b`) === "a...b");
ok("scrub collapses 4+ dots", scrubVoice("a....b") === "a...b");
ok("scrub two dashes collapse to one pause", scrubVoice(`${EM}${EM}`) === "...");
ok("scrub leaves clean copy", scrubVoice("clean lowercase copy") === "clean lowercase copy");
ok("scrub empty passthrough", scrubVoice("") === "");
ok("hasForbiddenDash true", hasForbiddenDash(`a${EM}b`) === true);
ok("hasForbiddenDash false", hasForbiddenDash("clean") === false);
const knownPhrase: string = FORBIDDEN_PHRASES[0];
ok(
  "findForbiddenPhrases flags a known phrase",
  findForbiddenPhrases(`hey ${knownPhrase} there`).includes(knownPhrase),
);
ok("findForbiddenPhrases clean -> empty", findForbiddenPhrases("zzz qqq wibble").length === 0);

// --- flameScore: the deterministic floor, per signal_type intent class ---
ok("flame hot searching_for = 0.8", flameScore({ signalType: "searching_for" }).score === 0.8);
ok("flame warm product_launch = 0.65", flameScore({ signalType: "product_launch" }).score === 0.65);
ok("flame base hiring = 0.5", flameScore({ signalType: "hiring" }).score === 0.5);
ok("flame + senior title", flameScore({ signalType: "searching_for", raw: { title: "VP Growth" } }).score === 0.9);
ok(
  "flame + exact category",
  flameScore({ signalType: "product_launch", raw: { category: "fintech" }, icpCategories: ["fintech"] }).score === 0.75,
);
ok(
  "flame capped at 1.0",
  flameScore({ signalType: "searching_for", raw: { title: "Chief X", category: "saas" }, icpCategories: ["saas"] }).score === 1,
);

// --- evaluateTrigger: the predicate matcher (nowMs injected for determinism) ---
const HIT = {
  signalType: "promotion",
  aiScore: 0.8,
  detectedAt: "2026-06-01T00:00:00.000Z",
  raw: { industry: "fintech", new_title: "VP Marketing" },
} as unknown as SignalHit;
const NOW = Date.parse("2026-06-01T00:00:00.000Z") + 2 * 36e5; // +2h
ok("trigger type match", evaluateTrigger({ signal_type: "promotion" }, HIT, null, NOW) === true);
ok("trigger type mismatch", evaluateTrigger({ signal_type: "funding_round" }, HIT, null, NOW) === false);
ok("trigger score_gte pass", evaluateTrigger({ score_gte: 0.75 }, HIT, null, NOW) === true);
ok("trigger score_gte fail", evaluateTrigger({ score_gte: 0.9 }, HIT, null, NOW) === false);
ok("trigger includes_any hit", evaluateTrigger({ raw: { industry_includes_any: ["saas", "fintech"] } }, HIT, null, NOW) === true);
ok("trigger includes_any miss", evaluateTrigger({ raw: { industry_includes_any: ["crypto"] } }, HIT, null, NOW) === false);
ok("trigger _in match", evaluateTrigger({ raw: { industry_in: ["fintech"] } }, HIT, null, NOW) === true);
ok("trigger not-negation passes (inner false)", evaluateTrigger({ not: { raw: { industry_in: ["crypto"] } } }, HIT, null, NOW) === true);
ok("trigger not-negation fails (inner true)", evaluateTrigger({ not: { raw: { industry_in: ["fintech"] } } }, HIT, null, NOW) === false);
ok("trigger freshness within window", evaluateTrigger({ detected_within_hours: 72 }, HIT, null, NOW) === true);
ok("trigger freshness stale", evaluateTrigger({ detected_within_hours: 1 }, HIT, null, NOW) === false);
ok(
  "trigger contact stage_not_in blocks",
  evaluateTrigger({ contact: { stage_not_in: ["replied"] } }, HIT, { stage: "replied" } as unknown as TriggerContact, NOW) === false,
);
ok("trigger null contact defers the clause", evaluateTrigger({ contact: { stage_not_in: ["replied"] } }, HIT, null, NOW) === true);

// --- validateGraph: the sequence publish gate ---
const graph = (nodes: unknown[], edges: unknown[]) =>
  ({ nodes, edges }) as unknown as SequenceGraph;
const gnode = (id: string, type: string, data: Record<string, unknown> = {}) => ({
  id,
  type,
  position: { x: 0, y: 0 },
  data,
});
const gedge = (id: string, source: string, target: string) => ({
  id,
  source,
  target,
  sourceHandle: null,
});
const okSend = { channel: "email", subject: "hi", body: "yo" };
ok(
  "graph valid start->send->end publishes",
  validateGraph(
    graph(
      [gnode("s", "start"), gnode("m", "send", okSend), gnode("e", "end")],
      [gedge("e1", "s", "m"), gedge("e2", "m", "e")],
    ),
  ).length === 0,
);
ok("graph empty is flagged", validateGraph(graph([], [])).length === 1);
ok(
  "graph send without body is flagged",
  validateGraph(
    graph(
      [gnode("s", "start"), gnode("m", "send", { channel: "email", subject: "hi", body: "" }), gnode("e", "end")],
      [gedge("e1", "s", "m"), gedge("e2", "m", "e")],
    ),
  ).some((i) => i.message.includes("body")),
);
ok(
  "graph with no end is flagged",
  validateGraph(
    graph([gnode("s", "start"), gnode("m", "send", okSend)], [gedge("e1", "s", "m")]),
  ).length > 0,
);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
