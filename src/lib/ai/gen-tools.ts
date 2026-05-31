import { tool } from "ai";
import { z } from "zod";
import { findLeadsByDomains, verifyEmails } from "@/lib/enrichment/leads-search";
import { loadLeads, type LeadInput } from "@/lib/supabase/leads";
import {
  listContactsFiltered,
  moveContactsStage,
  addContactTags,
  pipelineSummary,
  getContactEmail,
} from "@/lib/supabase/copilot";
import { sendDraftEmail } from "@/lib/email/send";
import { logOutboundEmail } from "@/lib/supabase/unibox";
import { enrichContactAction } from "@/app/actions/enrichment";
import { generateDraftAction } from "@/app/actions/drafts";
import { ANGLE_LABELS, type AngleType } from "@/lib/types/draft";
import { type ContactStage } from "@/lib/types/contact";

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
        "generate the 5-angle cold draft for one contact (fed their voice profile), self-judge all five, pick the winner. returns the winning angle (subject + body) + the five with scores. score is the judge's rating out of 10 (voice_match weighted heaviest) ... present it as 'X/10'.",
      inputSchema: z.object({ contactId: z.string().uuid() }),
      execute: async ({ contactId }) => {
        const r = await generateDraftAction({ contactId });
        if (!r.ok) return { ok: false, error: r.error };
        // weighted_total maxes at 55 (voice_match counts 1.5x) ... map to a
        // clean 0-10 so the copilot labels the denominator honestly.
        const toTen = (w: number) => Math.round((w / 5.5) * 10) / 10;
        const winner =
          r.draft.angles.find((a) => a.score?.is_winner) ?? r.draft.angles[0];
        return {
          ok: true,
          winner: winner
            ? {
                angle: ANGLE_LABELS[winner.angle_type as AngleType],
                subject: winner.subject,
                body: winner.body,
                score: toTen(winner.score?.weighted_total ?? 0),
              }
            : null,
          angles: r.draft.angles.map((a) => ({
            angle: ANGLE_LABELS[a.angle_type as AngleType],
            subject: a.subject,
            score: toTen(a.score?.weighted_total ?? 0),
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
      execute: async ({ stage, search, limit }) => ({
        contacts: await listContactsFiltered({ stage, search, limit }),
      }),
    }),

    move_stage: tool({
      description:
        "move one or more contacts to a pipeline stage. use 'do_not_contact' to dismiss/triage a bad lead. confirm with the user before moving a big batch.",
      inputSchema: z.object({
        contactIds: z.array(z.string().uuid()).min(1).max(200),
        stage: z.enum([
          "cold",
          "enriched",
          "drafted",
          "sequenced",
          "replied",
          "booked",
          "closed",
          "do_not_contact",
        ]),
      }),
      execute: async ({ contactIds, stage }) =>
        moveContactsStage(contactIds, stage as ContactStage),
    }),

    tag_contacts: tool({
      description:
        "add tags to one or more contacts (merges with existing, deduped, lowercased). e.g. tag a set 'fintech' or 'warm'.",
      inputSchema: z.object({
        contactIds: z.array(z.string().uuid()).min(1).max(200),
        tags: z.array(z.string()).min(1).max(10),
      }),
      execute: async ({ contactIds, tags }) => addContactTags(contactIds, tags),
    }),

    bulk_enrich: tool({
      description:
        "run path-A enrichment on several contacts at once (capped at 8 per call to keep cost in check). fills each one's personalization hook. returns a per-contact result.",
      inputSchema: z.object({
        contactIds: z.array(z.string().uuid()).min(1).max(8),
      }),
      execute: async ({ contactIds }) => {
        const results: {
          contactId: string;
          ok: boolean;
          hook?: string | null;
          needsManual?: boolean;
          error?: string;
        }[] = [];
        for (const contactId of contactIds) {
          const r = await enrichContactAction({ contactId });
          results.push(
            r.ok
              ? {
                  contactId,
                  ok: true,
                  hook: r.run.fields.hook ?? null,
                  needsManual: r.run.needsManual,
                }
              : { contactId, ok: false, error: r.error },
          );
        }
        return { results };
      },
    }),

    pipeline_summary: tool({
      description:
        "a quick read of the whole pipeline: total contacts, the breakdown by stage, how many still lack a personalization hook, and the top contacts by score. use when the user asks what's in their pipeline or where things stand.",
      inputSchema: z.object({}),
      execute: async () => pipelineSummary(),
    }),

    send_email: tool({
      description:
        "send an email to a contact via resend. this is the ONLY irreversible action you have ... ALWAYS show the user the recipient + subject + body and get an explicit yes before calling it, one send at a time. SAFE DEFAULT: test mode redirects the send to the user's own inbox (subject tagged '[test -> the lead]') so the real lead is NOT emailed unless GEN_SEND_MODE=live. report back honestly which mode it went in + who it actually reached. logs the send into the unibox.",
      inputSchema: z.object({
        contactId: z.string().uuid(),
        subject: z.string().min(1),
        body: z.string().min(1),
      }),
      execute: async ({ contactId, subject, body }) => {
        const c = await getContactEmail(contactId);
        if (!c?.email) {
          return {
            sent: false,
            error: "that contact has no email on file ... enrich it first.",
          };
        }
        const result = await sendDraftEmail({ to: c.email, subject, body });
        if (result.sent) {
          await logOutboundEmail({
            contactId,
            subject,
            body,
            externalId: result.id,
          });
        }
        return result;
      },
    }),
  };
}
