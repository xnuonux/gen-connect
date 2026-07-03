"use client";

import { useEffect, useRef, useState } from "react";

// the dollars-not-fuel hero, made kinetic ... the reframe that beats instantly's
// open-rate vanity stops being a static label and starts feeling like the tool
// prints money. counts up from 0 on load, and tweens from the prior value to the
// new one whenever a win re-climbs it (the win paths call router.refresh(), which
// re-renders this persisted client child with the new cents prop). whole dollars,
// comma-grouped. prefers-reduced-motion snaps straight to the value.
export function HeroStat({ cents }: { cents: number }) {
  const target = Math.max(0, Math.round(cents / 100));
  // SSR + hydration land on 0, then the raf climbs to target ... no mismatch
  // (server and first client paint agree on 0), and the count-up IS the moment.
  const [display, setDisplay] = useState(0);
  const fromRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const from = fromRef.current;
    if (reduce || from === target) {
      fromRef.current = target;
      setDisplay(target);
      return;
    }
    const duration = 900;
    const ease = (t: number) => 1 - Math.pow(1 - t, 3); // cubic ease-out
    let startTs: number | null = null;
    const step = (ts: number) => {
      if (startTs === null) startTs = ts;
      const p = Math.min(1, (ts - startTs) / duration);
      setDisplay(Math.round(from + (target - from) * ease(p)));
      if (p < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        fromRef.current = target;
      }
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [target]);

  return (
    <span className="text-glow-gold font-mono text-[28px] font-semibold leading-none tabular-nums text-lunari-gold">
      ${display.toLocaleString("en-US")}
    </span>
  );
}
