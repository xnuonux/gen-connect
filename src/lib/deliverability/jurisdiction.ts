// the gdpr / eprivacy hard-gate for COLD outreach, as a deterministic rule (not
// a model call). the 2026 reality: uk + france permit profession-related b2b
// cold email without prior consent; germany, spain, italy, poland, austria, and
// belgium require opt-in even for b2b (cnil fined solocal €900k in may 2025).
// so a cold send to a contact in a strict-opt-in country is BLOCKED unless the
// user has set a consent flag on that contact. replies are relationship mail and
// always pass. unknown country passes (the user carries can-spam-style
// responsibility; the gate exists to catch the clearly-unlawful-without-consent
// cases, not to block every contact whose country we never enriched).

// iso-2 codes that require prior opt-in for b2b cold email.
const STRICT_OPT_IN = new Set(["DE", "ES", "IT", "PL", "AT", "BE"]);

// common country names -> iso-2 for the strict set (and a few friendly ones), so
// the gate works whether enrichment stored "Germany" or "DE".
const NAME_TO_ISO: Record<string, string> = {
  germany: "DE",
  deutschland: "DE",
  spain: "ES",
  españa: "ES",
  espana: "ES",
  italy: "IT",
  italia: "IT",
  poland: "PL",
  polska: "PL",
  austria: "AT",
  österreich: "AT",
  osterreich: "AT",
  belgium: "BE",
  belgique: "BE",
  belgie: "BE",
  "united kingdom": "GB",
  uk: "GB",
  "great britain": "GB",
  england: "GB",
  france: "FR",
  "united states": "US",
  usa: "US",
  "united states of america": "US",
};

// normalize a raw country value to an iso-2 code, or null if we can't tell.
export function normalizeCountry(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/^[A-Za-z]{2}$/.test(trimmed)) return trimmed.toUpperCase();
  return NAME_TO_ISO[trimmed.toLowerCase()] ?? null;
}

export type JurisdictionVerdict = {
  allow: boolean;
  reason: string;
  country: string | null;
};

// the gate. cold sends to a strict-opt-in country are blocked unless consent is
// flagged; replies and all other cases pass.
export function jurisdictionGate(args: {
  country: string | null | undefined;
  kind: "cold" | "reply";
  consent?: boolean | null;
}): JurisdictionVerdict {
  const iso = normalizeCountry(args.country);
  if (args.kind === "reply") {
    return { allow: true, reason: "reply ... relationship mail, always allowed", country: iso };
  }
  if (args.consent) {
    return { allow: true, reason: "consent on file", country: iso };
  }
  if (iso && STRICT_OPT_IN.has(iso)) {
    return {
      allow: false,
      reason: `cold email to ${iso} needs prior opt-in (gdpr/eprivacy) ... mark consent or skip`,
      country: iso,
    };
  }
  return { allow: true, reason: "no opt-in barrier for this jurisdiction", country: iso };
}
