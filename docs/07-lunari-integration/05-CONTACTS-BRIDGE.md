# the contacts reconciliation ... `outreach_contacts` -> `gc_contacts`

*the one data decision the fold needs the lunari cc to move on. the crew (atlas
scouts, nova drafts) writes lunari's `outreach_contacts`; gen connect's pipeline
reads `gc_contacts`. since gen replaces the outreach surface, gc_contacts becomes
the source of truth. write sites + mappings verified against the live files.*

---

## the shape of the conflict

two contact tables coexist on the shared substrate:
- **`outreach_contacts`** (crew) ... 6-stage `pipeline_stage` (lead/contacted/replied/
  booked/paid/lost) + a separate `status` lifecycle (pending/sent/bounced). written
  by the crew's lead-gen + scout + the old daily-outreach drafter/sender. read by the
  old `OutreachPage` via `app/routes/pipeline.js`.
- **`gc_contacts`** (gen) ... 8-value `stage` CHECK (cold/enriched/drafted/sequenced/
  replied/booked/closed/do_not_contact), richer (enrichment_data jsonb, ai_score,
  source provenance, footprint, country/jurisdiction_consent), company normalized into
  `gc_companies` via `company_id`. already live on the shared substrate.

gen connect IS the upgrade and IS replacing the outreach surface, including the old
draft/send engine (gen drafts via `/api/gen/draft/generate`, sends via
`/api/gen/unibox/send`). so the reconciliation is not "sync two equals" ... it is
"narrow the crew to lead DISCOVERY, point discovery at gc_contacts, retire the rest."

---

## the 12 crew write sites (verified, file:line)

grouped by crew action:

**lead-gen inserts** (the maps/apollo/serper scrape)
- `engines/outreach.js:540` POST outreach_contacts ... name, email, website, niche,
  city, google_rating, phone, verified_email, title, company, source, user_id
- `routes/outreach.js:185` POST outreach_contacts ... user_id, name, company, title,
  email, source, industry, notes, status:'pending'

**scout inserts** (atlas web-research; dedupes on (user_id,email)+(user_id,source) first)
- `engines/outreach.js:725` POST outreach_contacts ... user_id, name, company, title,
  email, source, industry, notes, verified_email, status:'pending'
- `routes/outreach.js:247` POST outreach_contacts ... user_id, name, company, title,
  email, source, industry, notes, status:'pending'

**draft patches** (nova writes email_subject/email_body) ... SUPERSEDED by gen
- `engines/outreach.js:889`, `routes/outreach.js:70`, `routes/outreach.js:323`,
  `routes/outreach.js:388`

**stage / send patches** (status:'sent'/sent_at/'bounced'/pipeline_stage) ... SUPERSEDED
- `engines/outreach.js:919`, `routes/outreach.js:90`, `routes/outreach.js:436`,
  `routes/outreach.js:448`, `routes/pipeline.js:43` (the kanban drag, retired with OutreachPage)

---

## recommendation: repoint discovery, retire the rest

**repoint the 4 DISCOVERY inserts** (engines:540, engines:725, routes:185, routes:247)
to write `gc_contacts` through one shared helper. those are the only contact-CREATION
points and the only crew writes worth keeping ... the crew's value narrows to "find
real people," which is exactly gen's `cold` intake.

**retire the draft + send + stage patches** (the other 8 sites). they belong to the
old daily-outreach engine that gen supersedes; once the gen sector is live, gen owns
drafting (`gc_drafts`), sending (`gc_unibox_messages` + `gc_deliverability_events`),
and stage moves (the sector's own supabase-direct/route writes). do not repoint them;
let them go inert with the old engine.

### the shared helper (the repoint target)
```js
// app/engines/gen-contacts.js  ... the one place crew discovery writes gen's pipeline.
async function saveGenContact(sbAdmin, userId, lead) {
  const email = (lead.email || '').trim().toLowerCase() || null;

  // 1. normalize company -> gc_companies (gen requires company_id, not a string col)
  let companyId = null;
  if (lead.company) {
    const [existing] = await sbAdmin('GET',
      `gc_companies?user_id=eq.${userId}&name=eq.${encodeURIComponent(lead.company)}&select=id&limit=1`);
    companyId = existing?.id
      ?? (await sbAdmin('POST', 'gc_companies', { user_id: userId, name: lead.company }))?.[0]?.id
      ?? null;
  }

  // 2. dedupe on the gen unique index (user_id, lower(email)) ... crew can hold dupes,
  //    gen rejects on conflict; check-then-insert (or POST with Prefer: resolution=ignore-duplicates).
  if (email) {
    const [dupe] = await sbAdmin('GET',
      `gc_contacts?user_id=eq.${userId}&email=eq.${encodeURIComponent(email)}&select=id&limit=1`);
    if (dupe) return { saved: false, reason: 'duplicate', id: dupe.id };
  }

  // 3. insert ... 1:1 cols up top; everything crew-only folds into enrichment_data.
  const row = {
    user_id: userId,
    name: lead.name || null,
    email,
    title: lead.title || null,
    company_id: companyId,
    source: lead.source || 'crew_scout',
    stage: 'cold',                         // crew discovery == gen cold intake
    enrichment_data: {
      crew: { industry: lead.industry, niche: lead.niche, city: lead.city,
              website: lead.website, google_rating: lead.google_rating,
              phone: lead.phone, verified_email: lead.verified_email, notes: lead.notes },
    },
  };
  const [created] = await sbAdmin('POST', 'gc_contacts', row);
  return { saved: true, id: created?.id };
}
module.exports = { saveGenContact };
```
then each discovery site swaps its `sbAdmin('POST','outreach_contacts',{...})` for
`saveGenContact(sbAdmin, userId, lead)`.

---

## column mapping (outreach_contacts -> gc_contacts)

| crew column | gen target | note |
|---|---|---|
| name, email, title | name, email, title | 1:1 |
| company (string) | gc_companies(name) + gc_contacts.company_id | upsert + link (helper above) |
| source | source | 1:1 |
| industry, niche, city, website, google_rating, phone, verified_email, notes | enrichment_data jsonb | no dedicated cols; nest under `enrichment_data.crew` |
| email_subject / email_body | gc_drafts / gc_unibox_messages | NEVER onto the contact row ... gen models drafts/copy separately |
| sent_at | last_action_at + gc_deliverability_events | no sent_at col on gc_contacts |
| deal_value | gc_outcome_events.dollar_value | dollars live in the outcome ledger, not the contact |
| (gen-only) linkedin_url, ai_score, warmth_score, tags, source_signal_id, source_trigger_id, country, jurisdiction_consent | leave at defaults | no crew source |

---

## stage mapping (the load-bearing collapse)

the crew has TWO axes (`status` lifecycle + `pipeline_stage` kanban) that collapse
into gen's single `stage`. drive primarily off `pipeline_stage`, fall back to `status`:

| crew signal | gen stage |
|---|---|
| pipeline_stage 'lead' / null + status 'pending' | cold |
| status 'pending' with email_subject/body present (drafted, unsent) | drafted |
| pipeline_stage 'contacted' / status 'sent' | sequenced |
| pipeline_stage 'replied' | replied |
| pipeline_stage 'booked' | booked |
| pipeline_stage 'paid' | closed |
| pipeline_stage 'lost' | do_not_contact (see gap 1) |
| status 'bounced' | do_not_contact (+ a gc_suppression row) |

note: with the repoint-discovery recommendation, fresh crew contacts land at `cold`
and gen drives the rest of the stage progression itself ... so the full mapping above
only matters if you ALSO backfill existing `outreach_contacts` rows (a one-time
migration) or run the mirror option below.

### gaps to decide
1. gen has no `lost` stage. 'paid'->'closed' (won) but 'lost' has no clean home ...
   map 'lost'->'do_not_contact' (suppresses re-contact) unless you want to add a
   `lost`/`disqualified` value to the gc_contacts CHECK (a small additive migration).
2. crew `company` is a string; gen requires a `gc_companies` upsert + `company_id`
   (handled by the helper).
3. `email_subject`/`email_body` must route to `gc_drafts`/`gc_unibox_messages`, never
   the contact row (no such columns).
4. `deal_value` routes to `gc_outcome_events`, not the contact.
5. crew writes are service-role with a manual `user_id`; the gen insert must set
   `user_id` (RLS `own_gc_contacts`) AND respect `unique(user_id, lower(email))` ...
   crew can hold duplicate emails, gen rejects on conflict, so dedupe before insert
   (the helper does).

---

## the two options

**A ... repoint + retire (recommended, the target state).** discovery inserts write
gc_contacts via the helper; the old draft/send/stage engine goes inert. one source of
truth (gc_contacts), no sync, matches "gen replaces outreach." the cutover is: ship
the gen sector reading gc_contacts, repoint the 4 discovery sites, stop calling the
old `runDailyOutreach`. existing `outreach_contacts` rows backfill once via the helper
if you want history carried over.

**B ... mirror (the safe transition, optional).** keep `outreach_contacts` live and
add a write-through (or a postgres trigger) that mirrors each new crew row into
`gc_contacts`. lets both surfaces run during a cutover window, at the cost of two
tables to keep in sync (last-write-wins drift risk). use only if you want the old
outreach tab and the gen sector both live for a beat before retiring the old one.

**lean:** A. the mirror earns its keep only if dom wants a side-by-side period; the
clean fold is repoint-discovery + retire-the-old-engine, and let gc_contacts be the
single pipeline the gen sector owns end to end.
