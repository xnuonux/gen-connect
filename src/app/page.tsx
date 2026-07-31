import Link from "next/link";
import type { Metadata } from "next";
import { PLANS, PLAN_KEYS } from "@/lib/billing/plans";

export const metadata: Metadata = {
  title: "gen connect ... outreach that sounds like you",
  description:
    "AI cold outreach with closer instinct. voice-matched drafts from live buying-intent signals, a unibox that doesn't suck, and a hero stat in dollars, not open rates.",
};

const FEATURES = [
  {
    kicker: "voice-matched drafts",
    title: "five angles, one voice. yours.",
    body: "gen writes every cold email five different ways, then a second pass judges them on relevance, voice match, opening strength, and whether it would actually get a reply. the winner ships. it reads like you on a good day, because it learned from what you actually wrote.",
  },
  {
    kicker: "buying-intent signals",
    title: "leads from live signals, not stale lists.",
    body: "no csv graveyards. gen watches for the moments people are actually in market ... hiring posts, launches, funding, the public tells ... and puts those people in your pipeline while the window is still open.",
  },
  {
    kicker: "the unibox",
    title: "every reply, one room, zero suck.",
    body: "replies from every inbox and platform land in one thread view. gen drafts the follow-up in your voice with a confidence score, and you hit send. nothing gets buried, nothing gets forgotten.",
  },
  {
    kicker: "the number that matters",
    title: "\"$x in opportunities\", not open rates.",
    body: "open rates are vanity. the hero stat is dollars ... closed plus pipeline value, live. the tool should feel like it prints money, not burns credits.",
  },
] as const;

const FAQ = [
  {
    q: "does it send for me?",
    a: "gen drafts and queues, you approve. nothing leaves your inbox without your eyes on it. you're the sender of record ... always.",
  },
  {
    q: "what is fuel?",
    a: "one fuel is one fully qualified lead: found from a live signal, verified, enriched, and drafted in your voice. not a credit for a button press ... a lead, end to end.",
  },
  {
    q: "can it really sound like me?",
    a: "gen learns your voice from samples of your actual writing and self-scores every draft on voice match before it shows you anything. below a threshold of your samples it starts from a careful prior and sharpens as you send. if a draft feels off, don't send it ... that feedback is the training.",
  },
  {
    q: "can i cancel?",
    a: "anytime, two clicks, no retention maze. cancel and you keep access until the end of the billing period. your data is yours ... export it, then delete it if you want.",
  },
] as const;

function SectionKicker({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-lunari-neutral-400">
      {children}
    </span>
  );
}

export default function Home() {
  return (
    <main className="lunari-canvas relative min-h-screen overflow-hidden">
      {/* a deeper bloom focused behind the hero ... the light in the room */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(42% 50% at 50% 32%, var(--gen-accent-soft) 0%, transparent 70%)",
        }}
      />

      {/* hero */}
      <section className="relative z-10 flex min-h-screen flex-col items-center justify-center px-6">
        <div className="flex max-w-2xl flex-col items-center text-center">
          <div className="mb-9 flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.32em] text-lunari-neutral-400">
            <span className="h-1 w-1 rounded-full bg-gen-accent" />
            lunari titans
            <span className="h-1 w-1 rounded-full bg-gen-accent" />
          </div>

          <h1
            className="text-6xl tracking-tight md:text-7xl"
            style={{ fontFamily: "var(--font-cinzel)" }}
          >
            gen connect
          </h1>

          {/* the gold hairline ... a single thread of light, the one gold moment */}
          <div className="mt-6 h-px w-24 bg-gradient-to-r from-transparent via-lunari-gold to-transparent opacity-70" />

          <p className="mt-7 max-w-xl text-balance text-lg leading-relaxed text-lunari-cream/75 md:text-xl">
            the outreach tool where every email sounds like you wrote it and
            every campaign feels like a real instrument.
          </p>

          <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row">
            <Link
              href="/login"
              className="planetarium surface-raised rounded-md bg-gen-accent px-8 py-3 font-medium tracking-wide text-lunari-cream hover:bg-gen-accent/90 hover:shadow-[0_0_44px_-8px_var(--gen-accent)]"
            >
              get gen
            </Link>
            <Link
              href="/pipeline"
              className="rounded-md border border-lunari-surface-elevated px-8 py-3 font-medium tracking-wide text-lunari-neutral-400 transition-colors hover:border-lunari-neutral-500 hover:text-lunari-cream"
            >
              open the pipeline
            </Link>
          </div>

          <div className="mt-16 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.22em] text-lunari-neutral-500">
            <span>voice-matched</span>
            <span className="text-gen-accent">·</span>
            <span>signal-driven</span>
            <span className="text-gen-accent">·</span>
            <span>closer instinct</span>
          </div>
        </div>
      </section>

      {/* the problem */}
      <section className="relative z-10 mx-auto max-w-2xl px-6 py-24 text-center">
        <SectionKicker>the problem</SectionKicker>
        <h2
          className="mt-4 text-3xl leading-tight text-lunari-cream md:text-4xl"
          style={{ fontFamily: "var(--font-cinzel)" }}
        >
          cold outreach sounds like a saas template. that&apos;s why it dies.
        </h2>
        <p className="mx-auto mt-6 max-w-xl leading-relaxed text-lunari-neutral-400">
          every tool in the category taught you to trade your voice for volume.
          merge tags, spin syntax, the same three openers in ten thousand
          inboxes. buyers can smell it in the first line, and the delete is
          reflex. the fix isn&apos;t a better template ... it&apos;s no template
          at all. a draft that sounds like you, sent to someone who&apos;s
          actually in market, at the moment it matters.
        </p>
      </section>

      {/* features */}
      <section className="relative z-10 mx-auto max-w-5xl px-6 py-16">
        <div className="grid gap-4 sm:grid-cols-2">
          {FEATURES.map((f) => (
            <div
              key={f.kicker}
              className="surface-raised rounded-xl border border-lunari-surface-elevated bg-lunari-surface p-7"
            >
              <SectionKicker>{f.kicker}</SectionKicker>
              <h3 className="mt-3 text-xl leading-snug text-lunari-cream">
                {f.title}
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-lunari-neutral-400">
                {f.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* pricing */}
      <section className="relative z-10 mx-auto max-w-4xl px-6 py-24">
        <div className="text-center">
          <SectionKicker>pricing</SectionKicker>
          <h2
            className="mt-4 text-3xl leading-tight text-lunari-cream md:text-4xl"
            style={{ fontFamily: "var(--font-cinzel)" }}
          >
            pick the room you need.
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-sm leading-relaxed text-lunari-neutral-400">
            one fuel is one fully qualified lead ... found from a live signal,
            verified, enriched, and drafted in your voice. that&apos;s the whole
            meter.
          </p>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          {PLAN_KEYS.map((key) => {
            const plan = PLANS[key];
            return (
              <div
                key={key}
                className="surface-raised flex flex-col rounded-xl border border-lunari-surface-elevated bg-lunari-surface p-6"
              >
                <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-lunari-neutral-400">
                  {plan.label}
                </span>
                <div className="mt-3 flex items-baseline gap-1.5">
                  <span className="font-mono text-[40px] leading-none tabular-nums text-lunari-cream">
                    ${plan.monthlyUsd}
                  </span>
                  <span className="text-sm text-lunari-neutral-500">/ mo</span>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-lunari-neutral-400">
                  {plan.fuel} fuel a month ... {plan.fuel} qualified, drafted
                  leads in your voice.
                </p>
                <Link
                  href="/login"
                  className="planetarium mt-6 flex items-center justify-center rounded-md bg-gen-accent px-4 py-2.5 text-sm font-medium text-lunari-cream hover:bg-gen-accent/90"
                >
                  start with {plan.label}
                </Link>
              </div>
            );
          })}
        </div>
      </section>

      {/* faq */}
      <section className="relative z-10 mx-auto max-w-2xl px-6 py-24">
        <div className="text-center">
          <SectionKicker>honest answers</SectionKicker>
          <h2
            className="mt-4 text-3xl leading-tight text-lunari-cream"
            style={{ fontFamily: "var(--font-cinzel)" }}
          >
            the questions you&apos;d actually ask.
          </h2>
        </div>
        <div className="mt-10 space-y-6">
          {FAQ.map((item) => (
            <div
              key={item.q}
              className="border-b border-lunari-surface-elevated pb-6"
            >
              <h3 className="text-base font-medium text-lunari-cream">
                {item.q}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-lunari-neutral-400">
                {item.a}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* footer */}
      <footer className="relative z-10 border-t border-lunari-surface-elevated px-6 py-10">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-4 text-center">
          <div className="flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.32em] text-lunari-neutral-400">
            <span className="h-1 w-1 rounded-full bg-gen-accent" />
            lunari titans
            <span className="h-1 w-1 rounded-full bg-gen-accent" />
          </div>
          <div className="flex items-center gap-6 text-sm text-lunari-neutral-500">
            <Link
              href="/privacy"
              className="transition-colors hover:text-lunari-cream"
            >
              privacy
            </Link>
            <Link
              href="/terms"
              className="transition-colors hover:text-lunari-cream"
            >
              terms
            </Link>
          </div>
          <p className="font-mono text-[11px] text-lunari-neutral-500">
            © {new Date().getFullYear()} lunari titans
          </p>
        </div>
      </footer>
    </main>
  );
}
