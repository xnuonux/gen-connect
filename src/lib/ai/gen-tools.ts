import { tool } from "ai";
import { z } from "zod";
import {
  findLeadsByDomains,
  findLeadsByIcp,
  verifyEmails,
} from "@/lib/enrichment/leads-search";
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
import { resolveFootprintAction } from "@/app/actions/footprint";
import { generateDraftAction } from "@/app/actions/drafts";
import { logOutcomeAction } from "@/app/actions/outcomes";
import { OUTCOME_TYPES } from "@/lib/supabase/outcomes";
import { detectSlop } from "@/lib/ai/slop";
import { ANGLE_LABELS, type AngleType } from "@/lib/types/draft";
import { type ContactStage } from "@/lib/types/contact";
import { type Tier } from "@/lib/supabase/entitlements";
import { reserveCost, TOOL_COST_CENTS } from "@/lib/ai/gen-guard";

// the Gen copilot's tool belt. each wraps a capability shipped this build:
// find (hunter), verify (millionverifier), load + import (rls insert), enrich
// (path A), draft (5-angle + judge), read pipeline. the agent plans which to
// call from the user's brief. bound to the signed-in user so every write is
// theirs.
//
// the money-costing tools call reserveCost(tier, kind, projectedCents, units)
// FIRST, passing the most this call could spend ... free users get a clean
// voice-checked refusal, paid users are refused if this call would breach today's
// ceiling, and on a pass the projected (upper-bound) spend is ATOMICALLY reserved +
// logged in one db step (so concurrent turns can't both slip past the cap, and the
// tool does NOT log again). the zero-cost organize/import tools never gate.
// load_contacts is the terminal step
// of the paid find->verify->load flow, so it is paid-gated too (free users bring
// their own list via import_leads, which stamps truthful import provenance).
export function buildGenTools(userId: string, tier: Tier) {
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
        "find real leads at company domains via hunter. YOU supply the domains ... you know which companies fit the brief (a16z.com / sequoiacap.com for vc, stripe.com / ramp.com for tech, etc). optional titleIncludes filters by role. returns candidates with emails + confidence. this does NOT load anything ... show the user and get a yes before load_contacts. PAID action.",
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
        // hunter bills per domain-search request; cost scales with the domains
        // actually queried (capped at 12), so the ledger tracks real fan-out.
        const domainsQueried = Math.min(domains.length, 12);
        const gate = await reserveCost(
          tier,
          "find_leads",
          TOOL_COST_CENTS.find_leads * domainsQueried,
          domainsQueried,
        );
        if (gate) return gate;
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

    find_leads_by_icp: tool({
      description:
        "find real leads by ICP via apify (boneswill leads-generator) ... title + country + industry, NO domains needed. use this when you do NOT have specific company domains but DO have a persona (e.g. 'heads of growth at fintechs in the US'). apollo-grade discovery with emails. apify charges a 100-lead minimum per run, so limit floors at 100. does NOT load ... show the candidates, get a yes, then verify_emails + load_contacts. PAID action.",
      inputSchema: z.object({
        titles: z
          .array(z.string())
          .optional()
          .describe("job titles, e.g. ['head of growth','vp marketing']"),
        countries: z
          .array(z.string())
          .optional()
          .describe("person countries, e.g. ['United States']"),
        industries: z
          .array(z.string())
          .optional()
          .describe("industries, e.g. ['fintech','b2b saas']"),
        limit: z
          .number()
          .int()
          .min(100)
          .max(500)
          .optional()
          .describe("leads to fetch (100 min ... apify bills for 100 even if fewer match)"),
      }),
      execute: async ({ titles, countries, industries, limit }) => {
        const want = Math.min(Math.max(limit ?? 100, 100), 500);
        // apify bills per ~100 leads; the ledger tracks the real run size.
        const units = Math.ceil(want / 100);
        const gate = await reserveCost(
          tier,
          "find_leads_by_icp",
          TOOL_COST_CENTS.find_leads_by_icp * units,
          units,
        );
        if (gate) return gate;
        const { leads, notes, fetched } = await findLeadsByIcp({
          titles,
          countries,
          industries,
          limit: want,
        });
        return {
          count: leads.length,
          fetched,
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
        "verify a batch of emails (millionverifier). returns status per email: valid | catchall | unknown | disposable | invalid. drop invalid + disposable before loading. capped at 60. PAID action.",
      inputSchema: z.object({ emails: z.array(z.string()).min(1).max(60) }),
      execute: async ({ emails }) => {
        // billed per email ... cost scales with the batch size.
        const gate = await reserveCost(
          tier,
          "verify_emails",
          TOOL_COST_CENTS.verify_emails * emails.length,
          emails.length,
        );
        if (gate) return gate;
        const results = await verifyEmails(emails);
        return { results };
      },
    }),

    load_contacts: tool({
      description:
        "load gen-FOUND, verified leads into the pipeline as enriched contacts (the terminal step of the find_leads -> verify_emails -> load_contacts flow). dedupes + skips already-known emails, links companies. to bring in the user's OWN existing list, use import_leads instead (that is the free path). ONLY call after showing the candidates and getting an explicit yes.",
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
      execute: async ({ leads }) => {
        // load_contacts stamps hunter/millionverifier provenance + 'enriched'
        // stage ... only truthful for gen-found leads (a paid flow). a free user
        // bringing their own list must go through import_leads (truthful 'import'
        // provenance, cold, needs-enrichment) so the upsell isn't laundered away.
        if (tier !== "paid") {
          return {
            ok: false,
            blocked: "paid_only",
            message:
              "load_contacts is the paid find -> verify -> load step. to bring in your own list, free, i'll use import_leads ... want me to?",
          };
        }
        return loadLeads(userId, leads as LeadInput[]);
      },
    }),

    import_leads: tool({
      description:
        "import the user's OWN existing leads from structured rows (name + email, optional company + title). FREE ... no external lookup, no cost. loads them as COLD contacts that still need verify / enrich / draft (those are the paid moves). use this whenever someone wants to bring in a list they already have. ALWAYS show the parsed count + a few names and get a yes before loading.",
      inputSchema: z.object({
        rows: z
          .array(
            z.object({
              name: z.string(),
              email: z.string(),
              company_name: z.string().nullish(),
              title: z.string().nullish(),
            }),
          )
          .min(1)
          .max(500),
      }),
      execute: async ({ rows }) => {
        const clean = rows.filter((r) => /^\S+@\S+\.\S+$/.test(r.email.trim()));
        if (clean.length === 0) {
          return {
            loaded: 0,
            skipped: 0,
            error:
              "none of those had a usable email ... give me a name + email for each lead.",
          };
        }
        return loadLeads(userId, clean as LeadInput[], {
          source: "import",
          stage: "cold",
          verified: false,
          syntheticHook: false,
        });
      },
    }),

    enrich_contact: tool({
      description:
        "run path-A enrichment on one contact (perplexity / apollo / crawl4ai if configured) ... fills the personalization hook the drafter reads. returns what was found + needs_manual. PAID action.",
      inputSchema: z.object({ contactId: z.string().uuid() }),
      execute: async ({ contactId }) => {
        const gate = await reserveCost(
          tier,
          "enrich_contact",
          TOOL_COST_CENTS.enrich_contact,
        );
        if (gate) return gate;
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

    resolve_footprint: tool({
      description:
        "find a contact's public internet presence ... resolve their email into the social + web profiles they have PUBLICLY published about themselves (gravatar verified accounts + public github: x, linkedin, instagram, mastodon, bluesky, personal site, plus name/bio/role/location). FREE ... reads only official, open, public apis, no scraping and no cost. saves the link graph to the contact and returns it. reach for this when the user wants someone's socials or whole presence, not just an email. needs the contact to have an email on file.",
      inputSchema: z.object({ contactId: z.string().uuid() }),
      execute: async ({ contactId }) => {
        const r = await resolveFootprintAction({ contactId });
        if (!r.ok) return { ok: false, error: r.error };
        const f = r.footprint;
        return {
          ok: true,
          name: f.name ?? null,
          jobTitle: f.jobTitle ?? null,
          company: f.company ?? null,
          location: f.location ?? null,
          website: f.website ?? null,
          // the hook this resolve set on the contact (fill-missing) ... a
          // footprint-only contact is now draftable off this. mention it.
          hookSet: r.applied.hook ?? null,
          links: f.links.map((l) => ({
            platform: l.platform,
            url: l.url,
            verified: l.verified,
          })),
          sources: f.sources,
        };
      },
    }),

    draft_angles: tool({
      description:
        "generate the 5-angle cold draft for one contact (fed their voice profile), self-judge all five, pick the winner. returns the winning angle (subject + body) + the five with scores. score is the judge's rating out of 10 (voice_match weighted heaviest) ... present it as 'X/10'. PAID action.",
      inputSchema: z.object({ contactId: z.string().uuid() }),
      execute: async ({ contactId }) => {
        const gate = await reserveCost(
          tier,
          "draft_angles",
          TOOL_COST_CENTS.draft_angles,
        );
        if (gate) return gate;
        const r = await generateDraftAction({ contactId });
        if (!r.ok) return { ok: false, error: r.error };
        // weighted_total maxes at 55 (voice_match counts 1.5x) ... map to a
        // clean 0-10 so the copilot labels the denominator honestly.
        const toTen = (w: number) => Math.round((w / 5.5) * 10) / 10;
        const winner =
          r.draft.angles.find((a) => a.score?.is_winner) ?? r.draft.angles[0];
        // anti-slop guard: flag a winner that reads like an ai-sdr template
        // (formal opener + generic value prop + calendar-link drop) so gen can
        // offer to sharpen it before it ships. this is the moat ... never send
        // what a bot would send.
        const voice = winner ? detectSlop(winner.body) : null;
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
          voiceCheck: voice
            ? { verdict: voice.verdict, tells: voice.tells }
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
        "run path-A enrichment on several contacts at once (capped at 8 per call to keep cost in check). fills each one's personalization hook. returns a per-contact result. PAID action.",
      inputSchema: z.object({
        contactIds: z.array(z.string().uuid()).min(1).max(8),
      }),
      execute: async ({ contactIds }) => {
        const gate = await reserveCost(
          tier,
          "bulk_enrich",
          TOOL_COST_CENTS.bulk_enrich * contactIds.length,
          contactIds.length,
        );
        if (gate) return gate;
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

    log_outcome: tool({
      description:
        "log a real WIN to the opportunity ledger ... a gig/meeting booked, a closed deal, a qualified lead, a subscriber, a stream-revenue or merch spike. this is what powers the '$X in opportunities since launch' hero stat ... the number that makes the tool feel like it prints money. FREE, zero cost. pass the dollar value + the type, and the contactId it's tied to when you know it. reach for this the moment the user says they closed / booked / landed something.",
      inputSchema: z.object({
        contactId: z.string().uuid().nullish(),
        eventType: z.enum(OUTCOME_TYPES),
        dollarValue: z.number().min(0),
        note: z.string().nullish(),
      }),
      execute: async ({ contactId, eventType, dollarValue, note }) => {
        const r = await logOutcomeAction({
          contactId,
          eventType,
          dollarValue,
          note,
        });
        if (!r.ok) return { ok: false, error: r.error };
        return { ok: true, logged: { eventType, dollarValue } };
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
        "send an email to a contact via resend. this is the ONLY irreversible action you have ... ALWAYS show the user the recipient + subject + body and get an explicit yes before calling it, one send at a time. SAFE DEFAULT: test mode redirects the send to the user's own inbox (subject tagged '[test -> the lead]') so the real lead is NOT emailed unless GEN_SEND_MODE=live. report back honestly which mode it went in + who it actually reached. logs the send into the unibox. PAID action.",
      inputSchema: z.object({
        contactId: z.string().uuid(),
        subject: z.string().min(1),
        body: z.string().min(1),
      }),
      execute: async ({ contactId, subject, body }) => {
        const gate = await reserveCost(tier, "send_email", TOOL_COST_CENTS.send_email);
        if (gate) return gate;
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
