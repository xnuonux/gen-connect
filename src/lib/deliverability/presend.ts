import { jurisdictionGate } from "@/lib/deliverability/jurisdiction";

// the deterministic pre-send read for a contact ... will this land, and why /
// why not, shown in the composer BEFORE the user hits send. composes the same
// two hard gates guardedSend enforces (suppression + jurisdiction) so the
// guardrails are a felt, up-front signal, not a string returned after a blocked
// send. pure ... no i/o, fully testable.

export type PresendStatus = "ready" | "warn" | "blocked";

export type PresendVerdict = {
  status: PresendStatus;
  headline: string;
  reasons: string[];
};

export function presendVerdict(args: {
  suppressed: boolean;
  country: string | null | undefined;
  consent: boolean | null | undefined;
  kind: "cold" | "reply";
}): PresendVerdict {
  // a suppressed address is a hard no, whatever the kind.
  if (args.suppressed) {
    return {
      status: "blocked",
      headline: "on your suppression list",
      reasons: [
        "this address bounced, complained, or unsubscribed ... guardedSend will refuse it.",
      ],
    };
  }

  const j = jurisdictionGate({
    country: args.country,
    kind: args.kind,
    consent: args.consent,
  });
  if (!j.allow) {
    return {
      status: "blocked",
      headline: "blocked by the jurisdiction gate",
      reasons: [j.reason],
    };
  }

  const reasons: string[] = [];
  let status: PresendStatus = "ready";

  // a cold send with no country is allowed but worth a flag (can't run the
  // jurisdiction call cleanly without it).
  if (args.kind === "cold" && !j.country) {
    status = "warn";
    reasons.push(
      "no country on file ... cold send is allowed, but enrich for a jurisdiction-safe call.",
    );
  }
  // the anatomy nudge on a cold first touch.
  if (args.kind === "cold") {
    reasons.push(
      "cold first touch ... lead with them + a call-to-conversation, save the meeting ask for later.",
    );
  }

  return {
    status,
    headline: args.kind === "reply" ? "ready to reply" : "ready to send",
    reasons,
  };
}
