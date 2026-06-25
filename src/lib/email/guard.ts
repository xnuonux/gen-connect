import { jurisdictionGate } from "@/lib/deliverability/jurisdiction";

// the pure decision core of the send path. guardedSend gathers the inputs (from
// the suppression list, the sending-domains wizard, the contact's jurisdiction)
// and hands them here; this function enforces the ORDER the gates fire in and
// the exact verdict each produces. extracting it makes the ordering ... the
// safety-critical part ... deterministically testable, instead of "verified by
// construction" inside an io-bound function.
//
// order is load-bearing: suppression first (never email a do-not-contact, even
// in test mode), then the live-send domain gate (a real send must leave an
// authenticated domain), then the cold jurisdiction gate (gdpr/eprivacy).

export type SendKind = "cold" | "reply";

export type GuardInput = {
  // is the recipient on the user's suppression list?
  suppressed: boolean;
  // is this a real send (vs the test-mode redirect to the user's own inbox)?
  isLive: boolean;
  // is the from-domain spf+dkim+mx verified? (only consulted when isLive)
  domainVerified: boolean;
  // the domain a live send would leave from (for the error message).
  fromDomain: string;
  // the recipient's country + consent flag (only consulted when kind==="cold").
  country: string | null;
  consent: boolean | null;
  kind: SendKind;
};

export type GuardVerdict =
  | { allow: true }
  | {
      allow: false;
      gate: "suppression" | "domain" | "jurisdiction";
      mode: "test" | "live";
      error: string;
      suppressed?: boolean;
      blocked?: boolean;
    };

export function guardDecision(input: GuardInput): GuardVerdict {
  // 1. suppression hard-gate ... a suppressed address is never emailed, period.
  if (input.suppressed) {
    return {
      allow: false,
      gate: "suppression",
      mode: "test",
      suppressed: true,
      error: "that address is on your suppression list ... skipped, not sent.",
    };
  }

  // 1a. live-send domain gate ... a real send must leave an authenticated domain.
  // a no-op in test mode (the send redirects to the user's own inbox anyway).
  if (input.isLive && !input.domainVerified) {
    return {
      allow: false,
      gate: "domain",
      mode: "live",
      blocked: true,
      error: `live send blocked ... verify ${input.fromDomain} in deliverability first (spf + dkim + mx).`,
    };
  }

  // 1b. jurisdiction ... a cold send to a strict-opt-in eu country is blocked
  // unless consent is flagged. replies always pass.
  if (input.kind === "cold") {
    const verdict = jurisdictionGate({
      country: input.country,
      kind: "cold",
      consent: input.consent,
    });
    if (!verdict.allow) {
      return {
        allow: false,
        gate: "jurisdiction",
        mode: "test",
        blocked: true,
        error: `${verdict.reason}.`,
      };
    }
  }

  return { allow: true };
}
