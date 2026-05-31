import { PROVIDERS } from "@/lib/enrichment/providers";

// lead discovery + batch verification for the Gen copilot's tools. find by
// company domain via Hunter (the path that works on the free tier), verify in
// bulk via the email_verifier adapter (millionverifier primary). the agent
// supplies the domains ... it knows a16z is a vc, stripe is a tech co.

export type FoundLead = {
  name: string;
  first_name: string;
  last_name: string;
  title: string;
  email: string;
  confidence: number;
  company_name: string | null;
  company_domain: string;
};

async function getJson(url: string, timeoutMs = 25000): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`http ${res.status}`);
    return (await res.json()) as unknown;
  } finally {
    clearTimeout(timer);
  }
}

// find leads at the given company domains via Hunter domain-search. optional
// titleIncludes keeps only emails whose position matches one of the keywords.
export async function findLeadsByDomains(args: {
  domains: string[];
  titleIncludes?: string[];
  perDomain?: number;
}): Promise<{ leads: FoundLead[]; notes: string[] }> {
  const key = process.env.HUNTER_API_KEY;
  if (!key) return { leads: [], notes: ["hunter not configured"] };

  const perDomain = Math.min(Math.max(args.perDomain ?? 10, 1), 25);
  const wanted = (args.titleIncludes ?? []).map((t) => t.toLowerCase());
  const leads: FoundLead[] = [];
  const notes: string[] = [];

  for (const domain of args.domains.slice(0, 12)) {
    try {
      const json = (await getJson(
        `https://api.hunter.io/v2/domain-search?domain=${encodeURIComponent(domain)}&limit=${perDomain}&api_key=${encodeURIComponent(key)}`,
      )) as {
        data?: {
          organization?: string | null;
          emails?: {
            value?: string;
            first_name?: string;
            last_name?: string;
            position?: string;
            confidence?: number;
          }[];
        };
      };
      const org = json.data?.organization ?? null;
      for (const e of json.data?.emails ?? []) {
        if (!e.value || !e.first_name || !e.last_name) continue;
        if ((e.confidence ?? 0) < 70) continue;
        const title = e.position ?? "";
        if (
          wanted.length > 0 &&
          !wanted.some((w) => title.toLowerCase().includes(w))
        ) {
          continue;
        }
        leads.push({
          name: `${e.first_name} ${e.last_name}`,
          first_name: e.first_name,
          last_name: e.last_name,
          title,
          email: e.value,
          confidence: e.confidence ?? 0,
          company_name: org,
          company_domain: domain,
        });
      }
    } catch (err) {
      notes.push(`${domain}: ${err instanceof Error ? err.message : "failed"}`);
    }
  }

  const seen = new Set<string>();
  const deduped = leads.filter((l) => {
    const k = l.email.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return { leads: deduped, notes };
}

export type VerifyResult = { email: string; status: string; verified: boolean };

// verify a batch of emails through the email_verifier adapter (millionverifier
// primary, neverbounce fallback). capped so the agent can't drain credits.
export async function verifyEmails(emails: string[]): Promise<VerifyResult[]> {
  const verifier = PROVIDERS.email_verifier;
  const unique = Array.from(
    new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean)),
  ).slice(0, 60);

  const out: VerifyResult[] = [];
  for (const email of unique) {
    if (!verifier) {
      out.push({ email, status: "not_configured", verified: false });
      continue;
    }
    const r = await verifier.enrich({ email });
    out.push({
      email,
      status:
        typeof r.fields.email_status === "string"
          ? r.fields.email_status
          : r.status,
      verified: r.fields.email_verified === true,
    });
  }
  return out;
}
