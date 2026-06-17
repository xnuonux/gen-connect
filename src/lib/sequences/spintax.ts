// spintax + personalization-slot rendering ... pure + client-safe. {{a|b|c}} picks
// one option; {signal.*}/{contact.*}/{voice.*} resolve from a value map. the editor
// previews with sample values so "the signal IS the message" is visible while you
// write; the (later) pg-boss compiler resolves the real values at send time through
// this same function. one source of truth for the wedge.

export const SLOT_SAMPLES: Record<string, string> = {
  "{contact.name}": "marisol",
  "{contact.first_name}": "marisol",
  "{contact.title}": "vp marketing",
  "{contact.company}": "northbound studio",
  "{signal.company}": "northbound studio",
  "{signal.hook}": "your launch on product hunt",
  "{signal.new_title}": "vp marketing",
  "{signal.product_name}": "northbound",
  "{voice.opening}": "hey",
};

export const SLOT_TOKENS: string[] = Object.keys(SLOT_SAMPLES);

const SPINTAX_RE = /\{\{([^{}]*)\}\}/g;
const SLOT_RE = /\{[a-z]+\.[a-z_]+\}/gi;

// expand spintax deterministically by seed (so a render index gives a stable pick),
// then fill slots from the value map. unknown slots are left visible so a missing
// field is obvious, never silently blank.
export function renderSample(
  text: string,
  seed: number,
  values: Record<string, string> = SLOT_SAMPLES,
): string {
  let i = 0;
  const spun = text.replace(SPINTAX_RE, (_m, group: string) => {
    const opts = group.split("|");
    const pick = opts[(seed + i) % opts.length] ?? opts[0] ?? "";
    i += 1;
    return pick.trim();
  });
  return spun.replace(SLOT_RE, (m) => values[m.toLowerCase()] ?? m);
}

// the count of distinct spintax expansions ... surfaced as "{n} variations".
export function spintaxCombos(text: string): number {
  let total = 1;
  for (const m of text.matchAll(SPINTAX_RE)) {
    const group = m[1] ?? "";
    total *= Math.max(1, group.split("|").length);
  }
  return total;
}
