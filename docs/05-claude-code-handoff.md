# claude code handoff · week 1

the first packet. ships the pipeline + unibox shell. pipeline is the visual spine, unibox is the reply surface. once these land, every other chunk has a place to hang from.

## context

gen connect's MVP needs a working pipeline (twenty-grade record table + plane-style kanban) and a working unibox (gmail-style 3-pane reply surface). v1 ships without drafting engine, without sequences, without signals. just the spine. all data is contacts + threads + messages in supabase.

## user story

1. user signs in via magic link
2. lands on /pipeline ... sees kanban with 7 stages, empty by default
3. clicks "import csv" → uploads csv → column mapper → contacts populate in cold column
4. drags a card from cold to enriched ... card moves instantly, db updates
5. clicks a card → side drawer opens with 6 tabs (placeholder for now)
6. clicks "view as table" → same data renders as a dense spreadsheet
7. multi-selects 5 contacts → bulk action bar slides up from bottom → bulk-tag or bulk-move
8. switches to /unibox ... empty state with placeholder thread list
9. (week 2 wires inbound parsing so threads actually populate)

## technical scope

### files to create

- `src/middleware.ts` ... supabase auth middleware
- `src/lib/supabase/client.ts` ✅ (already scaffolded)
- `src/lib/supabase/server.ts` ✅ (already scaffolded)
- `src/lib/supabase/contacts.ts` ... typed query helpers
- `src/lib/db/migrations/0001_init.sql` ... initial schema + RLS
- `src/app/(auth)/login/page.tsx` ... magic link form
- `src/app/(auth)/callback/route.ts` ... auth callback handler
- `src/app/(app)/pipeline/PipelineKanban.tsx` ... dnd-kit kanban view
- `src/app/(app)/pipeline/PipelineTable.tsx` ... tanstack table view
- `src/app/(app)/pipeline/ContactSidePanel.tsx` ... right-side drawer
- `src/app/(app)/pipeline/BulkActionsBar.tsx` ... multi-select toolbar
- `src/app/(app)/pipeline/CsvImportDialog.tsx` ... csv upload + mapper
- `src/components/shared/ContactCard.tsx` ... kanban card
- `src/components/shared/StageChip.tsx`, `FlameScore.tsx`, `AvatarStack.tsx`
- `src/app/api/contacts/route.ts` ... list, create
- `src/app/api/contacts/[id]/route.ts` ... get, patch, delete
- `src/app/api/contacts/bulk/route.ts` ... bulk patch
- `src/app/api/contacts/import/route.ts` ... csv upload
- `src/app/(app)/unibox/ThreadList.tsx`, `ThreadView.tsx`, `ContactRail.tsx`

### db migration shape

```sql
-- 0001_init.sql

create table if not exists companies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  domain text,
  name text,
  industry text,
  size_range text,
  description text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table companies enable row level security;
create policy "own_companies" on companies for all using (user_id = auth.uid());

create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email text,
  linkedin_url text,
  name text,
  title text,
  company_id uuid references companies(id),
  ai_score numeric(3,1) default 0,
  warmth_score numeric(3,1) default 0,
  stage text default 'cold' check (stage in
    ('cold','enriched','drafted','sequenced','replied','booked','closed','do_not_contact')),
  source text,
  tags text[] default '{}',
  enrichment_data jsonb default '{}'::jsonb,
  last_action_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table contacts enable row level security;
create policy "own_contacts" on contacts for all using (user_id = auth.uid());

create unique index contacts_user_email on contacts(user_id, lower(email))
  where email is not null;
create unique index contacts_user_linkedin on contacts(user_id, linkedin_url)
  where linkedin_url is not null;
create index contacts_stage on contacts(user_id, stage);
create index contacts_score on contacts(user_id, ai_score desc);

create table if not exists unibox_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  contact_id uuid references contacts(id),
  channel text default 'email' check (channel in ('email','linkedin_dm','twitter_dm')),
  last_message_at timestamptz,
  unread_count int default 0,
  status text default 'open' check (status in ('open','snoozed','archived','closed')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table unibox_threads enable row level security;
create policy "own_threads" on unibox_threads for all using (user_id = auth.uid());

create table if not exists unibox_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  thread_id uuid not null references unibox_threads(id) on delete cascade,
  direction text not null check (direction in ('inbound','outbound')),
  subject text,
  body text,
  message_id_header text,
  in_reply_to text,
  sent_at timestamptz default now(),
  created_at timestamptz default now()
);
alter table unibox_messages enable row level security;
create policy "own_messages" on unibox_messages for all using (user_id = auth.uid());
create index messages_thread on unibox_messages(thread_id, sent_at desc);
```

### endpoints

- `GET /api/contacts?stage=&search=&sort=&limit=&offset=` ... paginated list
- `POST /api/contacts` ... create one
- `PATCH /api/contacts/:id` ... update fields
- `DELETE /api/contacts/:id` ... soft delete (sets stage = 'do_not_contact')
- `POST /api/contacts/bulk` ... `{ ids: [], action: 'move_stage'|'tag'|'delete', payload: {} }`
- `POST /api/contacts/import` ... csv upload, dedupes on linkedin_url + email

## acceptance criteria

- [ ] both kanban and table views render 1000 contacts in under 200ms (virtualized)
- [ ] drag a card from "cold" to "enriched" ... card moves instantly (optimistic), stage persists, on db fail snap back with sonner toast
- [ ] row click opens side drawer in under 100ms
- [ ] multi-select via shift-click in table or cmd-click in kanban ... bulk action bar slides up from bottom
- [ ] empty state for cold column reads "no leads yet ... import a list or paste a linkedin url to get started."
- [ ] csv import handles up to 10k rows with progress UI, dedupes on linkedin_url first then email
- [ ] view toggle persists per user across sessions
- [ ] /api/health returns `{ok:true, product:"gen-connect"}`
- [ ] every new table ships with RLS enabled + own_<table> policy
- [ ] unibox shell renders 3 panes with placeholder content (inbound wiring is week 2)
- [ ] all UI strings pass voice-keeper (lowercase, no em-dashes)
- [ ] all colors come from lunari tokens (no raw hex)

## constraints

- **voice**: lowercase everywhere. NO em-dashes. all error messages sound like dom wrote them.
- **performance**: virtualize anything over 50 rows. react-query staleTime 30s. side panel data lazy-loads.
- **security**: every query goes through supabase RLS, never bypass with service role from the frontend. csv upload size capped at 10MB.
- **accessibility**: drag-drop has keyboard fallback (space pick up, arrows move, space drop). focus trap on side drawer. esc closes.

## open questions

- **side drawer**: drawer (slides right) or modal (centers)? lean drawer for non-modal context retention.
- **csv mapper**: column mapper UI for non-standard CSVs, or hard fail on missing required columns? lean: hard fail v1, column mapper v1.5.
- **anon contact dedup**: if a contact has no email AND no linkedin_url, do we dedupe at all? lean: no, allow duplicates, surface a "merge similar" prompt in v1.5.

## the model routing

this packet has no AI calls. drafting engine lands week 2. for now, anthropic SDK is wired but unused.

## the parallel sessions

- `gen-main` worktree ... pipeline kanban + table + side drawer + csv import
- `gen-spike` worktree ... resend inbound parsing prototype (so week 2 has a head start)
- `gen-design` worktree ... lunari token enforcement, shadcn customization for table density

after this packet ships, the handoff for week 2 (drafting engine) drops.
