import { Resend } from "resend";
import { scrubVoice } from "@/lib/ai/scrub";

// the send boundary. SAFE BY DEFAULT: GEN_SEND_MODE is 'test' unless explicitly
// set to 'live'. in test mode every send is redirected to GEN_TEST_RECIPIENT
// (your own inbox) with the subject tagged [test->the-real-lead], so a real
// lead is NEVER emailed during dogfooding. flip GEN_SEND_MODE=live to send for
// real (the lunari.pro domain is verified, so live sends will actually land).
const SEND_MODE = (process.env.GEN_SEND_MODE ?? "test").toLowerCase();
// exported so the thread-token + message-id are built from the SAME from-address
// the send actually uses ... keeps the reply-to routing token coherent.
export const SEND_FROM = process.env.GEN_SEND_FROM ?? "gen <gen@lunari.pro>";

// true when sends reach real recipients (vs the test-mode redirect). the live-
// send domain gate reads this.
export const IS_LIVE = SEND_MODE === "live";

// the domain a send goes out from (the host of SEND_FROM).
export function sendFromDomain(): string {
  const m = SEND_FROM.match(/@([^>\s]+)/);
  return (m?.[1] ?? "lunari.pro").trim().toLowerCase();
}
const TEST_RECIPIENT =
  process.env.GEN_TEST_RECIPIENT ??
  process.env.DEV_LOGIN_EMAIL ??
  "xnuonux@gmail.com";

export type SendResult = {
  sent: boolean;
  mode: "test" | "live";
  intendedFor: string;
  deliveredTo: string;
  id?: string;
  error?: string;
};

export async function sendDraftEmail(args: {
  to: string;
  subject: string;
  body: string;
  // a tokenized reply-to ("gen+t.<threadId>.<sig>@...") so the recipient's reply
  // routes back to its thread, plus any rfc headers (e.g. a stable Message-ID,
  // List-Unsubscribe). both optional ... a bare send still works.
  replyTo?: string;
  headers?: Record<string, string>;
}): Promise<SendResult> {
  const mode: "test" | "live" = SEND_MODE === "live" ? "live" : "test";
  const intendedFor = args.to;
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    return {
      sent: false,
      mode,
      intendedFor,
      deliveredTo: "",
      error: "resend not configured ... set RESEND_API_KEY.",
    };
  }

  // the guardrail: in test mode the real recipient is swapped for your inbox.
  const deliveredTo = mode === "live" ? intendedFor : TEST_RECIPIENT;
  const cleanSubject = scrubVoice(args.subject);
  const subject =
    mode === "live"
      ? cleanSubject
      : `[test -> ${intendedFor}] ${cleanSubject}`;
  const body = scrubVoice(args.body);

  try {
    const resend = new Resend(key);
    const { data, error } = await resend.emails.send({
      from: SEND_FROM,
      to: deliveredTo,
      subject,
      text: body,
      ...(args.replyTo ? { replyTo: args.replyTo } : {}),
      ...(args.headers ? { headers: args.headers } : {}),
    });
    if (error) {
      return {
        sent: false,
        mode,
        intendedFor,
        deliveredTo,
        error: error.message,
      };
    }
    return { sent: true, mode, intendedFor, deliveredTo, id: data?.id };
  } catch (e) {
    return {
      sent: false,
      mode,
      intendedFor,
      deliveredTo,
      error: e instanceof Error ? e.message : "send failed",
    };
  }
}
