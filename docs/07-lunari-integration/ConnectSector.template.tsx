// ─────────────────────────────────────────────────────────────────────────────
// ConnectSector ... the gen connect sector for the LUNARI SPA
//
// TEMPLATE / handoff scaffold. drop into lunari/frontend/src/components/connect/
// and fill the view slots with the ported gen views. it mirrors ResearchPage (the
// atlas sector): a self-contained component that takes an optional callback prop
// and reads its own userId from useAuth(). gen stays ONE sector with its own
// internal sub-nav, so the gen UX is preserved intact inside lunari's shell.
//
// MOUNT (lunari/frontend/src/App.tsx):
//   import { ConnectSector } from './components/connect/ConnectSector';   // near line 31
//   {showOutreach && <ConnectSector onTakeIntoChat={handleResiduePrompt} />}  // replace line 767
//   (keep the 'outreach' view key, or rename to 'connect' in VIEW_PATHS + the nav)
//
// the two data patterns are shown below:
//   - genApi(...)        -> the [route] pattern for privileged/ai/send ops (node backend)
//   - useDirectQuery(...) -> the [direct] pattern for read-heavy lists (supabase + RLS)
// see PORT-PLAN.md for which surface uses which.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase'; // the SPA's anon-key singleton (RLS-scoped)
import { API_URL } from '../../lib/api'; // reuse the export, never re-hardcode

// the ported gen views go here (one per sub-tab). they are gen's existing
// "use client" components with their data access rewired per PORT-PLAN.md.
// import { PipelineView } from './views/PipelineView';
// import { UniboxView } from './views/UniboxView';
// import { SignalsView } from './views/SignalsView';
// import { CampaignsView } from './views/CampaignsView';
// import { TriggersView } from './views/TriggersView';
// import { GenCopilot } from './views/GenCopilot';

// gen's views use react-query. if the app does not already provide a client at a
// higher level, wrap the sector in its own. reuse the app's QueryClientProvider if
// one exists (do not nest two).
const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false } },
});

const TABS = [
  { id: 'pipeline', label: 'pipeline' },
  { id: 'unibox', label: 'unibox' },
  { id: 'signals', label: 'signals' },
  { id: 'campaigns', label: 'campaigns' },
  { id: 'triggers', label: 'triggers' },
  { id: 'gen', label: 'gen' },
] as const;

type TabId = (typeof TABS)[number]['id'];

export function ConnectSector({
  onTakeIntoChat,
}: {
  onTakeIntoChat?: (prompt: string) => void;
} = {}) {
  // canonical sector pattern: read identity from the hook, not from props.
  const { authUser, user } = useAuth();
  const userId = authUser?.id || user?.id || '';
  const [tab, setTab] = useState<TabId>('pipeline');

  return (
    <QueryClientProvider client={queryClient}>
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          background: 'var(--black)',
        }}
      >
        {/* sub-nav ... gen's own tabs, lunari mono-label + gen-accent active. */}
        <div
          style={{
            display: 'flex',
            gap: 4,
            padding: '10px 16px',
            borderBottom: '1px solid var(--border)',
            background: 'rgba(8,9,14,0.6)',
          }}
        >
          {TABS.map((t) => {
            const on = t.id === tab;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  letterSpacing: '0.15em',
                  textTransform: 'uppercase',
                  padding: '6px 12px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid transparent',
                  cursor: 'pointer',
                  color: on ? 'var(--gen)' : 'var(--muted)',
                  background: on ? 'color-mix(in srgb, var(--gen) 12%, transparent)' : 'transparent',
                  transition: 'color .18s cubic-bezier(.22,.68,.12,1)',
                }}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        {/* the active view. each ported gen view is a flex child of this. */}
        <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
          {tab === 'pipeline' && <PlaceholderView name="pipeline" userId={userId} />}
          {tab === 'unibox' && <PlaceholderView name="unibox" userId={userId} />}
          {tab === 'signals' && <PlaceholderView name="signals" userId={userId} />}
          {tab === 'campaigns' && <PlaceholderView name="campaigns" userId={userId} />}
          {tab === 'triggers' && <PlaceholderView name="triggers" userId={userId} />}
          {tab === 'gen' && (
            <PlaceholderView name="gen copilot" userId={userId} onTakeIntoChat={onTakeIntoChat} />
          )}
          {/* swap each PlaceholderView for the real ported view, e.g.:
              {tab === 'pipeline' && <PipelineView userId={userId} />} */}
        </div>
      </div>
    </QueryClientProvider>
  );
}

// ─── the [route] pattern: privileged / ai / send / enrichment ───────────────
// mirrors researchApi.ts ... fetch the lunari node backend with userId in the
// body/query; the backend holds the secrets, the model keys, and the send-mode
// flag. NEVER call providers or guardedSend from the browser.
export async function genApi<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${API_URL}/api/gen/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`gen api ${path} failed: ${res.status}`);
  return (await res.json()) as T;
}
// usage (draft a reply): await genApi('unibox/draft-reply', { userId, threadId })
//        (send):         await genApi('unibox/send', { userId, threadId, body })
//        (5-angle):      await genApi('draft/generate', { userId, contactId })
//        (run agent):    await genApi('signals/run-agent', { userId, agentId })

// ─── the [direct] pattern: read-heavy lists, RLS-scoped, no secret ──────────
// the supabase singleton is already session-bound; RLS scopes every row to the
// signed-in user. this is the fast path for the board / threads / feeds. PORT the
// .range() paging from gen's listContacts or the board truncates past 1000 rows.
export function usePipelineContacts() {
  return useQuery({
    queryKey: ['gc-contacts'],
    queryFn: async () => {
      const KANBAN = ['cold', 'enriched', 'drafted', 'sequenced', 'replied', 'booked', 'closed'];
      const page = 1000;
      let from = 0;
      const all: unknown[] = [];
      // loop the 1000-row pages to beat the PostgREST cap (verbatim from gen)
      for (;;) {
        const { data, error } = await supabase
          .from('gc_contacts')
          .select('*, company:gc_companies(name,domain)')
          .in('stage', KANBAN)
          .order('created_at', { ascending: false })
          .order('id', { ascending: false })
          .range(from, from + page - 1);
        if (error) throw error;
        all.push(...(data ?? []));
        if (!data || data.length < page) break;
        from += page;
      }
      return all;
    },
  });
}

// placeholder ... delete when the real views are ported in.
function PlaceholderView({
  name,
  userId,
  onTakeIntoChat,
}: {
  name: string;
  userId: string;
  onTakeIntoChat?: (p: string) => void;
}) {
  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: 8,
        color: 'var(--muted)',
        fontFamily: 'var(--font-mono)',
        fontSize: 12,
        letterSpacing: '0.1em',
      }}
    >
      <div style={{ color: 'var(--gen)' }}>{name}</div>
      <div style={{ fontSize: 10, color: 'var(--dim)' }}>
        port the gen {name} view here {userId ? '' : '(no user)'}
        {onTakeIntoChat ? ' · take-into-chat available' : ''}
      </div>
    </div>
  );
}
