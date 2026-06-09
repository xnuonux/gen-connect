// the anti-slop / convergence guard. the 2025-2026 reality: ~40% of cold email
// is now AI-generated, buyers run a "delete reflex" (73% delete on sight), and
// AI-shaped email gets spam-flagged ~8% vs ~3% for human. every autonomous
// AI-SDR (artisan, 11x, jazon) collapsed on exactly this ... they all fire the
// same template. gen's moat is the opposite: it refuses to send what a bot would
// send. this detector scores how closely a draft matches the AI-SDR TEMPLATE
// FINGERPRINT ... a formal/generic opener, a "we help X do Y" value prop, and a
// calendar-link drop ... so the drafter + the copilot + the unibox can flag or
// reject slop before it ever reaches a contact. heuristic, pure, deterministic,
// fixture-tested. complements the forbidden-phrase list (lib/ai/scrub) by
// catching STRUCTURE, not just banned words.

export type SlopCategory = "opener" | "valueprop" | "cta" | "filler";
export type SlopVerdict = "clean" | "flag" | "slop";

type SlopPattern = { re: RegExp; cat: SlopCategory; label: string };

// the template fingerprints. these target the FORMAL, generic, bot-shaped
// phrasings ... NOT genuine specific openers ("saw you shipped X", "the bridge on
// track 4 is the move"), which are exactly the gen voice and must stay clean.
const PATTERNS: SlopPattern[] = [
  // formal / generic openers (the bot tell ... not "saw you just launched X")
  { re: /i hope (this|you)\b.{0,24}\b(find|well|doing|great)/i, cat: "opener", label: "hope-this-finds-you" },
  { re: /\bi came across (your|you)\b/i, cat: "opener", label: "came-across-your" },
  { re: /\bi (just )?(wanted|want) to reach out\b/i, cat: "opener", label: "wanted-to-reach-out" },
  { re: /\breaching out (because|to see|about)\b/i, cat: "opener", label: "reaching-out-because" },
  { re: /\bi stumbled (up)?on\b/i, cat: "opener", label: "stumbled-upon" },
  { re: /\bhope (you're|you are|your)\b.{0,20}\b(well|great|doing|week)/i, cat: "opener", label: "hope-youre-well" },
  { re: /\bi noticed that you\b/i, cat: "opener", label: "i-noticed-that-you" },

  // generic value props (the "we help" SDR formula)
  { re: /\bwe help (companies|teams|businesses|brands|founders|people|you)\b/i, cat: "valueprop", label: "we-help-X" },
  { re: /\bour (platform|tool|solution|software|product|service) (helps|enables|lets|allows)\b/i, cat: "valueprop", label: "our-platform-helps" },
  { re: /\bwe specialize in\b/i, cat: "valueprop", label: "we-specialize-in" },
  { re: /\bi help \w+ (do|get|achieve|scale|grow|land|close|book)\b/i, cat: "valueprop", label: "i-help-X-do-Y" },
  { re: /\bdrive (more )?(revenue|pipeline|growth|leads|sales|results)\b/i, cat: "valueprop", label: "drive-more-pipeline" },
  { re: /\b(boost|10x|supercharge|streamline|optimize|unlock)\b.{0,20}\b(your|their|the)\b/i, cat: "valueprop", label: "boost-your-X" },

  // calendar-link drops (the bot's only ask)
  { re: /\bbook(ing)? a (quick )?(time|call|chat|meeting|demo|slot)\b/i, cat: "cta", label: "book-a-time" },
  { re: /\bgrab (\d+ )?(minutes|mins?)\b/i, cat: "cta", label: "grab-15-minutes" },
  { re: /\bschedule a (quick )?(call|chat|demo|time|meeting)\b/i, cat: "cta", label: "schedule-a-call" },
  { re: /\bfind a time (on )?(my |your )?calendar\b/i, cat: "cta", label: "find-a-time-calendar" },
  { re: /\bcalendly\b/i, cat: "cta", label: "calendly-link" },
  { re: /\b(are|would) you (free|available|open) (for|to)\b.{0,24}\b(call|chat|conversation|demo|connect)/i, cat: "cta", label: "are-you-free-for-a-call" },
  { re: /\bworth a (quick )?(call|chat|conversation)\b/i, cat: "cta", label: "worth-a-quick-call" },
  { re: /\bjump on a (quick )?call\b/i, cat: "cta", label: "jump-on-a-call" },
  { re: /\bopen to (a )?(quick )?(chat|call|conversation|connecting)\b/i, cat: "cta", label: "open-to-a-chat" },

  // filler / corporate cringe
  { re: /\bjust wanted to\b/i, cat: "filler", label: "just-wanted-to" },
  { re: /\bquick question\b/i, cat: "filler", label: "quick-question" },
  { re: /\bcircle back\b/i, cat: "filler", label: "circle-back" },
  { re: /\btouch base\b/i, cat: "filler", label: "touch-base" },
  { re: /\bsynergy\b/i, cat: "filler", label: "synergy" },
  { re: /\bleverage\b/i, cat: "filler", label: "leverage" },
  { re: /\butilize\b/i, cat: "filler", label: "utilize" },
  { re: /\bpick your brain\b/i, cat: "filler", label: "pick-your-brain" },
  { re: /\bmove the needle\b/i, cat: "filler", label: "move-the-needle" },
  { re: /\bthought (it|this) (might|could|may) be (relevant|a (good )?fit|of interest)\b/i, cat: "filler", label: "thought-it-might-be-relevant" },
  { re: /\blet me know if (you'd|you would|youd) be (open|interested)\b/i, cat: "filler", label: "let-me-know-if-open" },
];

export type SlopResult = {
  score: number; // 0..1, how template-shaped
  verdict: SlopVerdict;
  tells: string[]; // matched pattern labels
  categories: SlopCategory[]; // distinct categories hit
};

// score a draft against the template fingerprint. base contribution per matched
// pattern, plus a co-occurrence bonus for the structural tell (a generic opener
// PLUS a calendar-link cta is the signature shape; opener + valueprop + cta is
// the full bot template).
export function detectSlop(input: string): SlopResult {
  if (!input || !input.trim()) {
    return { score: 0, verdict: "clean", tells: [], categories: [] };
  }
  const tells: string[] = [];
  const cats = new Set<SlopCategory>();
  for (const p of PATTERNS) {
    if (p.re.test(input)) {
      tells.push(p.label);
      cats.add(p.cat);
    }
  }

  let score = Math.min(0.6, tells.length * 0.15);
  const has = (c: SlopCategory) => cats.has(c);
  // the AI-SDR signature: a generic opener AND a calendar-link ask.
  if (has("opener") && has("cta")) score += 0.3;
  // the full template: opener + value prop + cta.
  if (has("opener") && has("valueprop") && has("cta")) score += 0.2;
  score = Math.min(1, Math.round(score * 100) / 100);

  const verdict: SlopVerdict =
    score >= 0.6 ? "slop" : score >= 0.3 ? "flag" : "clean";

  return { score, verdict, tells, categories: Array.from(cats) };
}
