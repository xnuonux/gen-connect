import {
  PROVIDER_COST_CENTS,
  type EnrichedFields,
  type EnrichmentSource,
  type ProviderResult,
} from "@/lib/types/enrichment";

// the provider adapters. each reads its own env key and runs real HTTP when
// configured; absent a key it returns a clean { status: 'skipped',
// reason: 'not_configured' } so the waterfall still runs end to end (and just
// flags needs_manual when nothing is wired). the heavy async actors
// (apify, crawl4ai) ultimately belong on the railway orchestrator ... these
// in-app adapters cover the hot path A single-lead case.

export type EnrichmentInput = {
  name?: string | null;
  email?: string | null;
  linkedin_url?: string | null;
  title?: string | null;
  company_name?: string | null;
  company_domain?: string | null;
};

export type EnrichmentProvider = {
  source: EnrichmentSource;
  enrich(input: EnrichmentInput): Promise<ProviderResult>;
};

// result builders ... cost is only charged on a real 'ok' call.
function ok(
  source: EnrichmentSource,
  fields: EnrichedFields,
  raw?: unknown,
): ProviderResult {
  return {
    source,
    status: "ok",
    costCents: PROVIDER_COST_CENTS[source] ?? 0,
    fields,
    raw,
  };
}

function skipped(source: EnrichmentSource, reason: string): ProviderResult {
  return { source, status: "skipped", costCents: 0, fields: {}, reason };
}

function errored(source: EnrichmentSource, reason: string): ProviderResult {
  return { source, status: "error", costCents: 0, fields: {}, reason };
}

// fetch with a hard timeout so a hung provider never stalls the server action.
async function fetchJson(
  url: string,
  init: RequestInit,
  timeoutMs = 20000,
): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    if (!res.ok) {
      throw new Error(`http ${res.status}`);
    }
    return (await res.json()) as unknown;
  } finally {
    clearTimeout(timer);
  }
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : undefined;
}

// ----- perplexity sonar ... role context + recent activity ----------------
// fits cleanly in-app. asks sonar for a strict-json hook + signals.
const perplexity: EnrichmentProvider = {
  source: "perplexity_sonar",
  async enrich(input) {
    const key = process.env.PERPLEXITY_API_KEY;
    if (!key) return skipped("perplexity_sonar", "not_configured");
    const who = [input.name, input.title, input.company_name]
      .filter(Boolean)
      .join(", ");
    if (!who) return skipped("perplexity_sonar", "no contact identity to search");

    try {
      const raw = (await fetchJson("https://api.perplexity.ai/chat/completions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: "sonar",
          messages: [
            {
              role: "system",
              content:
                "you research a person for cold outreach. return ONLY strict json: {\"hook\": string, \"signals\": string[], \"title\"?: string, \"company_name\"?: string}. the hook is one specific, recent, verifiable thing about them to open with. lowercase, no em-dashes.",
            },
            { role: "user", content: `research: ${who}` },
          ],
          temperature: 0.2,
        }),
      })) as { choices?: { message?: { content?: string } }[] };

      const content = raw.choices?.[0]?.message?.content ?? "";
      let parsed: Record<string, unknown> = {};
      try {
        const match = content.match(/\{[\s\S]*\}/);
        if (match) parsed = JSON.parse(match[0]) as Record<string, unknown>;
      } catch {
        // fall through ... use the raw content as the hook
      }
      const fields: EnrichedFields = {
        hook: str(parsed.hook) ?? str(content),
        signals: Array.isArray(parsed.signals)
          ? (parsed.signals.filter((s) => typeof s === "string") as string[])
          : undefined,
        title: str(parsed.title),
        company_name: str(parsed.company_name),
      };
      return ok("perplexity_sonar", fields, { content: content.slice(0, 800) });
    } catch (e) {
      return errored("perplexity_sonar", e instanceof Error ? e.message : "failed");
    }
  },
};

// ----- crawl4ai ... company website scrape (self-hosted sidecar) -----------
const crawl4ai: EnrichmentProvider = {
  source: "crawl4ai",
  async enrich(input) {
    const base = process.env.CRAWL4AI_API_URL;
    if (!base) return skipped("crawl4ai", "not_configured");
    const domain = input.company_domain;
    if (!domain) return skipped("crawl4ai", "no company domain to scrape");

    const url = domain.startsWith("http") ? domain : `https://${domain}`;
    try {
      const raw = (await fetchJson(`${base.replace(/\/$/, "")}/crawl`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ urls: [url] }),
      })) as { results?: { markdown?: string }[]; markdown?: string };

      const markdown =
        raw.results?.[0]?.markdown ?? raw.markdown ?? "";
      const firstLine = markdown
        .split("\n")
        .map((l) => l.trim())
        .find((l) => l.length > 40);
      const fields: EnrichedFields = {
        hook: firstLine ? `their site: ${firstLine.slice(0, 180)}` : undefined,
      };
      return ok("crawl4ai", fields, { snippet: markdown.slice(0, 600) });
    } catch (e) {
      return errored("crawl4ai", e instanceof Error ? e.message : "failed");
    }
  },
};

// ----- apify linkedin profile + email ... email of last resort ------------
// the token is gated separately from the actor id so a configured token never
// burns credits on a guessed actor ... both must be set to run.
const apifyLinkedin: EnrichmentProvider = {
  source: "apify_linkedin",
  async enrich(input) {
    const token = process.env.APIFY_TOKEN;
    const actor = process.env.APIFY_LINKEDIN_ACTOR;
    if (!token) return skipped("apify_linkedin", "not_configured");
    if (!actor) {
      return skipped("apify_linkedin", "no actor ... set APIFY_LINKEDIN_ACTOR");
    }
    if (!input.linkedin_url) {
      return skipped("apify_linkedin", "no linkedin url on the contact");
    }

    try {
      const raw = (await fetchJson(
        `https://api.apify.com/v2/acts/${encodeURIComponent(actor)}/run-sync-get-dataset-items?token=${token}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ profileUrls: [input.linkedin_url] }),
        },
        60000,
      )) as Record<string, unknown>[];

      const row = Array.isArray(raw) ? (raw[0] ?? {}) : {};
      const r = row as Record<string, unknown>;
      const fields: EnrichedFields = {
        email: str(r.email) ?? str(r.workEmail),
        title: str(r.headline) ?? str(r.title) ?? str(r.occupation),
        company_name: str(r.companyName) ?? str(r.company),
        location: str(r.location) ?? str(r.geoLocationName),
      };
      return ok("apify_linkedin", fields, { keys: Object.keys(r).slice(0, 20) });
    } catch (e) {
      return errored("apify_linkedin", e instanceof Error ? e.message : "failed");
    }
  },
};

// ----- apollo ... single-lead lookup (path A fallback) --------------------
const apollo: EnrichmentProvider = {
  source: "apollo",
  async enrich(input) {
    const key = process.env.APOLLO_API_KEY;
    if (!key) return skipped("apollo", "not_configured");
    if (!input.name && !input.email && !input.linkedin_url) {
      return skipped("apollo", "no identity to match");
    }

    try {
      const raw = (await fetchJson("https://api.apollo.io/v1/people/match", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": key },
        body: JSON.stringify({
          name: input.name ?? undefined,
          organization_name: input.company_name ?? undefined,
          linkedin_url: input.linkedin_url ?? undefined,
        }),
      })) as { person?: Record<string, unknown> };

      const p = raw.person ?? {};
      const org = (p.organization ?? {}) as Record<string, unknown>;
      const fields: EnrichedFields = {
        email: str(p.email),
        title: str(p.title),
        linkedin_url: str(p.linkedin_url),
        company_name: str(org.name),
        company_domain: str(org.primary_domain) ?? str(org.website_url),
        industry: str(org.industry),
      };
      return ok("apollo", fields, { matched: !!raw.person });
    } catch (e) {
      return errored("apollo", e instanceof Error ? e.message : "failed");
    }
  },
};

// the registry, keyed by source, so the orchestrator resolves an order to
// concrete adapters.
export const PROVIDERS: Record<EnrichmentSource, EnrichmentProvider | null> = {
  perplexity_sonar: perplexity,
  crawl4ai,
  apify_linkedin: apifyLinkedin,
  apollo,
  // path B providers live on the railway worker ... not wired in-app.
  apify_leads_finder: null,
  email_verifier: null,
  manual: null,
};
