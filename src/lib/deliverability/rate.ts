// the deliverability guardrails, as pure math. google/yahoo/microsoft want spam
// complaints under 0.1% and never near 0.3%; a hard-bounce rate over ~2% means
// the list is dirty. we auto-pause a user's active sequences when either crosses
// its line ... but only once there is enough volume for the rate to mean
// something. one early complaint at n=2 must not nuke every campaign.

// complaint rate that triggers auto-pause (the google/yahoo 0.1% line).
export const COMPLAINT_PAUSE_RATE = 0.001;
// hard-bounce rate that triggers auto-pause (well under the point of no return).
export const BOUNCE_PAUSE_RATE = 0.05;
// minimum sends before a rate is trusted enough to act on.
export const MIN_VOLUME_FLOOR = 20;

export type DeliverabilityCounts = {
  sent: number;
  complaints: number;
  bounces: number;
};

export type PauseVerdict = {
  pause: boolean;
  complaintRate: number;
  bounceRate: number;
  reason: string;
};

// decide whether the user's sequences should auto-pause given their rolling
// counts. deterministic ... a hard gate, not a model call.
export function shouldAutoPause(c: DeliverabilityCounts): PauseVerdict {
  const sent = Math.max(0, c.sent);
  const complaintRate = sent > 0 ? c.complaints / sent : 0;
  const bounceRate = sent > 0 ? c.bounces / sent : 0;

  if (sent < MIN_VOLUME_FLOOR) {
    return {
      pause: false,
      complaintRate,
      bounceRate,
      reason: `below the ${MIN_VOLUME_FLOOR}-send floor ... rate not yet meaningful`,
    };
  }
  if (complaintRate >= COMPLAINT_PAUSE_RATE) {
    return {
      pause: true,
      complaintRate,
      bounceRate,
      reason: `complaint rate ${(complaintRate * 100).toFixed(2)}% crossed the 0.1% line`,
    };
  }
  if (bounceRate >= BOUNCE_PAUSE_RATE) {
    return {
      pause: true,
      complaintRate,
      bounceRate,
      reason: `bounce rate ${(bounceRate * 100).toFixed(1)}% crossed the 5% line`,
    };
  }
  return {
    pause: false,
    complaintRate,
    bounceRate,
    reason: "within deliverability limits",
  };
}

// the resend event-type -> our event_type map. unknown types return null so the
// webhook can ignore noise without a thrown error.
export function mapResendEventType(t: string): string | null {
  const m: Record<string, string> = {
    "email.sent": "sent",
    "email.delivered": "delivered",
    "email.delivery_delayed": "delivery_delayed",
    "email.bounced": "bounced",
    "email.complained": "complained",
    "email.opened": "opened",
    "email.clicked": "clicked",
  };
  return m[t] ?? null;
}

// which events suppress the recipient (never send to them again).
export function suppressionReasonFor(eventType: string): "hard_bounce" | "complaint" | null {
  if (eventType === "bounced") return "hard_bounce";
  if (eventType === "complained") return "complaint";
  return null;
}
