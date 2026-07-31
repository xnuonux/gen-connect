import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "terms ... gen connect",
  description:
    "the terms for using gen connect, in plain language: your data is yours, cancel anytime, you approve every send, and anti-spam law is on you.",
};

const SECTIONS = [
  {
    title: "the deal",
    body: "gen connect is a tool that finds leads from live buying-intent signals and drafts outreach in your voice. you pay a monthly subscription, we provide the tool. that's the deal; the rest is detail.",
  },
  {
    title: "your data is yours",
    body: "your account, your voice samples, your leads, your threads, your drafts ... yours. we process them to run the product for you and claim no ownership over any of it. export anytime; delete anytime (see the privacy page for how).",
  },
  {
    title: "the tool drafts, you approve",
    body: "gen drafts; nothing sends without your approval. that means every email that leaves your inbox is, legally and actually, from you. read your drafts. if one feels off, don't send it.",
  },
  {
    title: "no spam ... seriously",
    body: "you must comply with the anti-spam laws that apply to you and your recipients (can-spam, casl, gdpr, and friends). only contact people you have a lawful basis to contact, honor opt-outs fast, and include what the law requires in your messages. gen's deliverability and compliance features exist to help you do this well ... they help, they don't absolve. accounts that spam get suspended.",
  },
  {
    title: "billing and cancellation",
    body: "plans bill monthly through stripe. cancel anytime in two clicks ... you keep access until the end of the paid period, and we don't do retention mazes or exit surveys that block the door. fuel doesn't roll over between months.",
  },
  {
    title: "what we promise and what we don't",
    body: "we work hard to keep gen connect up, accurate, and improving, but it's provided as-is. we don't promise reply rates, meetings booked, or dollars in opportunities ... the number on your dashboard is a reflection of your pipeline, not a guarantee of one. to the extent the law allows, our liability is capped at what you've paid us in the last 12 months.",
  },
  {
    title: "changes",
    body: "if these terms change materially, we'll email you before the change takes effect. continuing to use gen connect after that means you accept the new terms; if you don't, cancel first.",
  },
  {
    title: "questions",
    body: "email privacy@lunari.pro ... a human reads it and a human answers.",
  },
] as const;

export default function TermsPage() {
  return (
    <main className="lunari-canvas relative min-h-screen overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(42% 40% at 50% 18%, var(--gen-accent-soft) 0%, transparent 70%)",
        }}
      />

      <div className="relative z-10 mx-auto max-w-2xl px-6 py-20">
        <Link
          href="/"
          className="font-mono text-[11px] uppercase tracking-[0.22em] text-lunari-neutral-500 transition-colors hover:text-lunari-cream"
        >
          ← gen connect
        </Link>

        <h1
          className="mt-8 text-4xl tracking-tight text-lunari-cream"
          style={{ fontFamily: "var(--font-cinzel)" }}
        >
          terms
        </h1>
        <div className="mt-6 h-px w-24 bg-gradient-to-r from-transparent via-lunari-gold to-transparent opacity-70" />
        <p className="mt-6 text-sm leading-relaxed text-lunari-neutral-400">
          honest saas terms in plain language. last updated july 2026.
        </p>

        <div className="mt-12 space-y-10">
          {SECTIONS.map((s) => (
            <section key={s.title}>
              <h2 className="text-lg font-medium text-lunari-cream">
                {s.title}
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-lunari-neutral-400">
                {s.body}
              </p>
            </section>
          ))}
        </div>

        <footer className="mt-16 border-t border-lunari-surface-elevated pt-8 text-center font-mono text-[11px] text-lunari-neutral-500">
          © {new Date().getFullYear()} lunari titans ·{" "}
          <Link href="/privacy" className="hover:text-lunari-cream">
            privacy
          </Link>
        </footer>
      </div>
    </main>
  );
}
