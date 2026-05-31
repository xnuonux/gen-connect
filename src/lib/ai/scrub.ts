import { FORBIDDEN_PHRASES } from "@/lib/types/draft";

// the voice scrub boundary (see docs/01-architecture.md). voice enforcement
// is defense in depth: the prompt asks for lowercase + no em-dashes, and
// this scrub guarantees it at the persistence boundary. nothing reaches a
// contact, a saved template, or the unibox composer un-scrubbed.
//
// the forbidden dash characters are computed from their codepoints, never
// embedded literally ... the voice-lint hook blocks any source file that
// contains the em-dash char, this file included. so we build them with
// String.fromCharCode the same way the voice-check script uses printf.
// em-dash U+2014, en-dash U+2013, horizontal bar U+2015.
const EM_DASH = String.fromCharCode(0x2014);
const EN_DASH = String.fromCharCode(0x2013);
const HORIZONTAL_BAR = String.fromCharCode(0x2015);
const DASH_CHARS = [EM_DASH, EN_DASH, HORIZONTAL_BAR];
const DASH_RE = new RegExp(`[${EM_DASH}${EN_DASH}${HORIZONTAL_BAR}]`, "g");

// replace any em/en-dash with the lunari pause marker, then collapse any run
// of four or more dots back to three so we never emit "....".
export function scrubVoice(input: string): string {
  if (!input) return input;
  return input.replace(DASH_RE, "...").replace(/\.{4,}/g, "...");
}

// true if the copy contains any forbidden dash character. uses includes, not
// a stateful global regex, so it is safe to call repeatedly.
export function hasForbiddenDash(input: string): boolean {
  if (!input) return false;
  return DASH_CHARS.some((d) => input.includes(d));
}

// find forbidden phrases in a piece of copy. case-insensitive substring.
export function findForbiddenPhrases(input: string): string[] {
  if (!input) return [];
  const haystack = input.toLowerCase();
  return FORBIDDEN_PHRASES.filter((p) => haystack.includes(p));
}

// the result of a voice pass over one piece of copy.
export type VoiceFlags = {
  clean: boolean;
  hadDash: boolean;
  forbidden: string[];
};

// scrub the dashes AND report what was found, so the caller can decide
// whether to regenerate a phrase-flagged angle.
export function scrubAndFlag(input: string): { text: string; flags: VoiceFlags } {
  const hadDash = hasForbiddenDash(input);
  const text = scrubVoice(input);
  const forbidden = findForbiddenPhrases(text);
  return {
    text,
    flags: { clean: !hadDash && forbidden.length === 0, hadDash, forbidden },
  };
}
