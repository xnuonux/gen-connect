import { createClient } from "@/lib/supabase/server";

// load discovered leads into the pipeline as gc_contacts (+ gc_companies),
// under the signed-in user via RLS. dedupes against existing emails, resolves
// or creates the company per domain, and stamps the enrichment_data the
// drafter reads (hook + verification). this is the Gen copilot's load tool.

export type LeadInput = {
  name: string;
  email: string;
  title?: string | null;
  company_name?: string | null;
  company_domain?: string | null;
  email_status?: string | null;
  email_verified?: boolean | null;
  confidence?: number | null;
  hook?: string | null;
};

export async function loadLeads(
  userId: string,
  leads: LeadInput[],
): Promise<{
  loaded: number;
  skipped: number;
  companiesCreated: number;
  error?: string;
}> {
  const supabase = await createClient();

  // dedupe input by lowercased email
  const seen = new Set<string>();
  const clean = leads.filter((l) => {
    const e = (l.email ?? "").trim().toLowerCase();
    if (!e || seen.has(e)) return false;
    seen.add(e);
    return true;
  });
  if (clean.length === 0) return { loaded: 0, skipped: 0, companiesCreated: 0 };

  const emails = clean.map((l) => l.email.trim().toLowerCase());

  // skip emails already in the pipeline
  const { data: existing } = await supabase
    .from("gc_contacts")
    .select("email")
    .in("email", emails);
  const existingEmails = new Set(
    ((existing ?? []) as { email: string | null }[])
      .map((r) => (r.email ?? "").toLowerCase())
      .filter(Boolean),
  );
  const toInsert = clean.filter(
    (l) => !existingEmails.has(l.email.trim().toLowerCase()),
  );
  const skipped = clean.length - toInsert.length;
  if (toInsert.length === 0) {
    return { loaded: 0, skipped, companiesCreated: 0 };
  }

  // resolve companies by domain: reuse existing rows, insert the missing ones
  const domains = Array.from(
    new Set(
      toInsert
        .map((l) => (l.company_domain ?? "").trim().toLowerCase())
        .filter(Boolean),
    ),
  );
  const domainToId = new Map<string, string>();
  let companiesCreated = 0;

  if (domains.length > 0) {
    const { data: existingCos } = await supabase
      .from("gc_companies")
      .select("id, domain")
      .in("domain", domains);
    for (const c of (existingCos ?? []) as {
      id: string;
      domain: string | null;
    }[]) {
      if (c.domain) domainToId.set(c.domain.toLowerCase(), c.id);
    }

    const missing = domains.filter((d) => !domainToId.has(d));
    if (missing.length > 0) {
      const coRows = missing.map((d) => {
        const lead = toInsert.find(
          (l) => (l.company_domain ?? "").toLowerCase() === d,
        );
        return { user_id: userId, name: lead?.company_name ?? d, domain: d };
      });
      const { data: insertedCos, error: coErr } = await supabase
        .from("gc_companies")
        .insert(coRows)
        .select("id, domain");
      if (coErr) {
        console.error("[leads] company insert failed", coErr);
        return {
          loaded: 0,
          skipped,
          companiesCreated: 0,
          error: "couldn't save the companies ... give it another shot.",
        };
      }
      for (const c of (insertedCos ?? []) as {
        id: string;
        domain: string | null;
      }[]) {
        if (c.domain) domainToId.set(c.domain.toLowerCase(), c.id);
      }
      companiesCreated = missing.length;
    }
  }

  const contactRows = toInsert.map((l) => {
    const dom = (l.company_domain ?? "").trim().toLowerCase();
    const score =
      typeof l.confidence === "number"
        ? Math.min(10, Math.round(l.confidence) / 10)
        : 0;
    const hook =
      l.hook ??
      (l.title && l.company_name ? `${l.title} at ${l.company_name}` : null);
    return {
      user_id: userId,
      name: l.name,
      email: l.email.trim().toLowerCase(),
      title: l.title ?? null,
      source: "gen",
      ai_score: score,
      stage: "enriched",
      company_id: dom ? (domainToId.get(dom) ?? null) : null,
      enrichment_data: {
        hook,
        company_name: l.company_name ?? null,
        company_domain: l.company_domain ?? null,
        email_status: l.email_status ?? null,
        email_verified: l.email_verified ?? false,
        confidence: l.confidence ?? null,
        sources: ["hunter", "millionverifier"],
        loaded_by: "gen",
      },
    };
  });

  const { error: ctErr } = await supabase
    .from("gc_contacts")
    .insert(contactRows);
  if (ctErr) {
    console.error("[leads] contact insert failed", ctErr);
    // a concurrent load of the same email can lose the dedup race and hit the
    // (user_id, lower(email)) unique index ... report it cleanly, never raw pg.
    const dup =
      ctErr.code === "23505" || /duplicate|unique/i.test(ctErr.message ?? "");
    return {
      loaded: 0,
      skipped,
      companiesCreated,
      error: dup
        ? "a few of those were already in your pipeline ... nothing new loaded."
        : "couldn't save those contacts ... give it another shot.",
    };
  }

  return { loaded: contactRows.length, skipped, companiesCreated };
}
