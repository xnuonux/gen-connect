import { PROVIDERS } from "@/lib/enrichment/providers";
import { getApifyPool, runApifyActorPooled } from "@/lib/enrichment/apify-pool";

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

// ----- apify ICP discovery (boneswill/leads-generator, bulk mode) ----------
// hunter finds by domain (you know the company); this finds by ICP (title +
// location + industry) ... apollo-style cold discovery, no domains needed. the
// actor charges a 100-lead minimum per run, so we floor at 100 and cap the
// upper bound so the agent can never trigger a 30k bill by accident. emails ride
// in the dataset; verify_emails is still the real gate before load.
export type IcpLeadQuery = {
  titles?: string[];
  countries?: string[];
  industries?: string[];
  employeeSizes?: string[];
  seniority?: string[];
  limit?: number;
};

function s(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

// strip a website url down to a bare domain (matches hunter's domain shape).
function domainOf(url: string): string {
  if (!url) return "";
  const bare = url.replace(/^https?:\/\//i, "").replace(/^www\./i, "");
  return (bare.split(/[/?#]/)[0] ?? "").trim();
}

// the boneswill/leads-generator dataset shape, verified against a live run:
// firstName, lastName, fullName, position, linkedinUrl, email, organizationName,
// organizationWebsite, organizationIndustry, state, country, seniority, ...
// the old snake_case / nested-organization fallbacks stay as a safety net in
// case a different leads actor is plugged into APIFY_LEADS_ACTOR.
function mapApifyLeadRow(r: Record<string, unknown>): FoundLead | null {
  const email = s(r.email);
  if (!email) return null; // no email = useless for cold outreach
  const org = (r.organization ?? {}) as Record<string, unknown>;
  const first = s(r.firstName) || s(r.first_name);
  const last = s(r.lastName) || s(r.last_name);
  const name =
    s(r.fullName) || s(r.name) || [first, last].filter(Boolean).join(" ") || email;
  const parts = name.split(/\s+/).filter(Boolean);
  return {
    name,
    first_name: first || parts[0] || "",
    last_name: last || parts.slice(1).join(" ") || "",
    title: s(r.position) || s(r.title) || s(r.headline),
    email,
    // apify/apollo rows are not hunter-confidence-scored; default mid-high and
    // let verify_emails be the truth before anything loads.
    confidence: 80,
    company_name:
      s(r.organizationName) || s(org.name) || s(r.organization_name) || null,
    company_domain:
      domainOf(s(r.organizationWebsite)) ||
      s(org.primary_domain) ||
      s(org.website_url) ||
      "",
  };
}

export async function findLeadsByIcp(
  q: IcpLeadQuery,
): Promise<{ leads: FoundLead[]; notes: string[]; fetched: number }> {
  const actor = process.env.APIFY_LEADS_ACTOR;
  if (getApifyPool().length === 0) {
    return { leads: [], notes: ["apify not configured"], fetched: 0 };
  }
  if (!actor) {
    return { leads: [], notes: ["no actor ... set APIFY_LEADS_ACTOR"], fetched: 0 };
  }
  if (!q.titles?.length && !q.industries?.length && !q.countries?.length) {
    return {
      leads: [],
      notes: ["need at least a title, industry, or country filter"],
      fetched: 0,
    };
  }

  const totalResults = Math.min(Math.max(q.limit ?? 100, 100), 500);
  const input: Record<string, unknown> = {
    includeEmails: true,
    contactEmailStatus: "verified",
    totalResults,
  };
  if (q.titles?.length) input.personTitle = q.titles;
  if (q.countries?.length) input.personCountry = q.countries;
  if (q.industries?.length) input.industry = q.industries;
  if (q.employeeSizes?.length) input.companyEmployeeSize = q.employeeSizes;
  if (q.seniority?.length) input.seniority = q.seniority;

  // the pool rotates across our apify keys + fails over a spent/limited one.
  const run = await runApifyActorPooled(actor, input);
  if (!run.ok) return { leads: [], notes: [run.error], fetched: 0 };

  const rows = run.items as Record<string, unknown>[];
  const seen = new Set<string>();
  const leads: FoundLead[] = [];
  for (const r of rows) {
    const lead = mapApifyLeadRow(r);
    if (!lead) continue;
    const k = lead.email.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    leads.push(lead);
  }
  return { leads, notes: [], fetched: rows.length };
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
