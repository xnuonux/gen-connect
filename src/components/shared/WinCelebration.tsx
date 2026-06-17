"use client";

import { useEffect, useRef } from "react";

// the win celebration ... the one decorative gold moment the design system
// reserves for booked + closed. a burgundy core blooms into a single gold ring
// and a one-line gen quote, then clears itself. pointer-events-none so it never
// blocks the click underneath. reduced-motion users get the toast, not the bloom.
const QUOTES = [
  "that one landed. go again.",
  "money on the board. who's next.",
  "thats the move. keep going.",
  "another door open. dont stop.",
] as const;

export function WinCelebration({
  show,
  quote,
  onDone,
}: {
  show: boolean;
  quote?: string;
  onDone: () => void;
}) {
  // keep onDone current without re-arming the timer ... both call sites pass a
  // fresh inline arrow, so keying the timer on onDone would reset it on every
  // parent re-render. one deterministic timer per show transition.
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    if (!show) return;
    const t = setTimeout(() => onDoneRef.current(), 1950);
    return () => clearTimeout(t);
  }, [show]);

  if (!show) return null;

  const line = quote ?? QUOTES[0];

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[60] flex items-center justify-center overflow-hidden"
    >
      <div
        className="gen-win-ring absolute h-72 w-72 rounded-full"
        style={{
          background:
            "radial-gradient(circle, var(--gen-accent) 0%, var(--lunari-gold) 55%, transparent 72%)",
          filter: "blur(2px)",
        }}
      />
      <div className="gen-win-quote relative flex flex-col items-center gap-2">
        <span
          className="text-2xl"
          style={{ fontFamily: "var(--font-cinzel)", color: "var(--lunari-gold)" }}
        >
          {line}
        </span>
      </div>
    </div>
  );
}
