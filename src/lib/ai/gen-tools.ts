import { tool } from "ai";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { findLeadsByDomains, verifyEmails } from "@/lib/enrichment/leads-search";
import { loadLeads, type LeadInput } from "@/lib/supabase/leads";
import { enrichContactAction } from "@/app/actions/enrichment";
import { generateDraftAction } from "@/app/actions/drafts";
import { ANGLE_LABELS, type AngleType } from "@/lib/types/draft";

// the Gen copilot's tool belt. each wraps a capability shipped this build:
// find (hunter), verify (millionverifier), load (rls insert), enrich (path A),
// draft (5-angle + judge), read pipeline. the agent plans which to call from
// the user's brief. bound to the signed-in user so every write is theirs.
export function buildGenTools(userId: string) {
  return {
    plan: tool({
      description:
        "declare or update your step plan so the user can watch progress. call it BEFORE starting a multi-step task with every step 'pending', then call it again each time a step changes ... mark the one you are on 'active' and finished ones 'done'. keep labels short + lowercase. this renders as a live checklist in the chat.",
      inputSchema: z.object({
        steps: z
          .array(
            z.object({
              label: z.string().describe("short lowercase step label"),
              status: z.enum(["pending", "active", "done"]),
            }),
          )
          .min(1)
          .max(10),
      }),
      execute: async ({ steps }) => ({ steps }),
    }),

    find_leads: tool({
      description:
        "find real leads at company domains via hunter. YOU supply the domains ... you know which companies fit the brief (a16z.com / sequoiacap.com for vc, stripe.com / ramp.com for tech, etc). optional titleIncludes filters by role. returns candidates with emails + confidence. this does NOT load anything ... show the user and get a yes before load_contacts.",
      inputSchema: z.object({
        domains: z
          .array(z.string())
          .min(1)
          .max(12)
          .describe("company domains, e.g. ['a16z.com','stripe.com']"),
        titleIncludes: z
          .array(z.string())
          .optional()
          .describe("keep only titles containing one of these, e.g. ['partner','founder','head of']"),
        perDomain: z.number().int().min(1).max(25).optional(),
      }),
      execute: async ({ domains, titleIncludes, perDomain }) => {
        const { leads, notes } = await findLeadsByDomains({
          domains,
          titleIncludes,
          perDomain,
        });
        return {
          count: leads.length,
          notes,
          leads: leads.map((l) => ({
            name: l.name,
            title: l.title,
            email: l.email,
            company_name: l.company_name,
            company_domain: l.company_domain,
            confidence: l.confidence,
          })),
        };
      },
    }),

    verify_emails: tool({
      description:
        "verify a batch of emails (millionverifier). returns status per email: valid | catchall | unknown | disposable | invalid. drop invalid + disposable before loading. capped at 60.",
      inputSchema: z.object({ emails: z.array(z.string()).min(1).max(60) }),
      execute: async ({ emails }) => ({ results: await verifyEmails(emails) }),
    }),

    load_contacts: tool({
      description:
        "load leads into the pipeline as enriched contacts, under the user. dedupes + skips already-known emails, links companies. ONLY call after showing the candidates and getting an explicit yes.",
      inputSchema: z.object({
        leads: z
          .array(
            z.object({
              name: z.string(),
              email: z.string(),
              title: z.string().nullish(),
              company_name: z.string().nullish(),
              company_domain: z.string().nullish(),
              email_status: z.string().nullish(),
              email_verified: z.boolean().nullish(),
              confidence: z.number().nullish(),
              hook: z.string().nullish(),
            }),
          )
          .min(1)
          .max(100),
      }),
      execute: async ({ leads }) => loadLeads(userId, leads as LeadInput[]),
    }),

    enrich_contact: tool({
      description:
        "run path-A enrichment on one contact (perplexity / apollo / crawl4ai if configured) ... fills the personalization hook the drafter reads. returns what was found + needs_manual.",
      inputSchema: z.object({ contactId: z.string().uuid() }),
      execute: async ({ contactId }) => {
        const r = await enrichContactAction({ contactId });
        if (!r.ok) return { ok: false, error: r.error };
        return {
          ok: true,
          hook: r.run.fields.hook ?? null,
          needsManual: r.run.needsManual,
          costCents: r.run.totalCostCents,
        };
      },
    }),

    draft_angles: tool({
      description:
        "generate the 5-angle cold draft for one contact (opus, fed the voice profile), self-judge the five, pick the winner. returns the winning angle + the five with scores.",
      inputSchema: z.object({ contactId: z.string().uuid() }),
      execute: async ({ contactId }) => {
        const r = await generateDraftAction({ contactId });
        if (!r.ok) return { ok: false, error: r.error };
        const winner =
          r.draft.angles.find((a) => a.score?.is_winner) ?? r.draft.angles[0];
        return {
          ok: true,
          winner: winner
            ? {
                angle: ANGLE_LABELS[winner.angle_type as AngleType],
                subject: winner.subject,
                body: winner.body,
              }
            : null,
          angles: r.draft.angles.map((a) => ({
            angle: ANGLE_LABELS[a.angle_type as AngleType],
            subject: a.subject,
            score: a.score?.weighted_total ?? 0,
          })),
        };
      },
    }),

    list_contacts: tool({
      description:
        "read the user's pipeline contacts. filter by stage and/or a name/company/title search. returns id, name, title, company, stage, score.",
      inputSchema: z.object({
        stage: z.string().nullish(),
        search: z.string().nullish(),
        limit: z.number().int().min(1).max(50).optional(),
      }),
      execute: async ({ stage, search, limit }) => {
        const supabase = await createClient();
        let q = supabase
          .from("gc_contacts")
          .select("id, name, title, stage, ai_score, company:gc_companies(name)")
          .order("created_at", { ascending: false })
          .limit(limit ?? 20);
        if (stage) q = q.eq("stage", stage);
        const { data, error } = await q;
        if (error) return { error: error.message };
        let rows = (data ?? []) as unknown as {
          id: string;
          name: string | null;
          title: string | null;
          stage: string;
          ai_score: number | string | null;
          company: { name: string | null } | null;
        }[];
        if (search) {
          const n = search.toLowerCase();
          rows = rows.filter(
            (r) =>
              (r.name ?? "").toLowerCase().includes(n) ||
              (r.company?.name ?? "").toLowerCase().includes(n) ||
              (r.title ?? "").toLowerCase().includes(n),
          );
        }
        return {
          contacts: rows.map((r) => ({
            id: r.id,
            name: r.name,
            title: r.title,
            company: r.company?.name ?? null,
            stage: r.stage,
            score: Number(r.ai_score) || 0,
          })),
        };
      },
    }),
  };
}
