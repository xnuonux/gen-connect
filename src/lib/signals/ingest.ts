import { runApifyActorPooled } from "@/lib/enrichment/apify-pool";
import { type SignalType } from "@/lib/types/signal";

// live signal ingestion off X (twitter). uses api-ninja/x-twitter-advanced-search
// (verified to run on the free tier + return real tweets, unlike apidojo which
// gates free runs). normalizes each tweet to the searching_for/tool_mention raw
// contract (docs/06) so the scorer + the feed + the drafter all read one shape.
// the actor is env-overridable; the default is the tested one.
const X_SEARCH_ACTOR =
  process.env.APIFY_X_SEARCH_ACTOR ?? "api-ninja~x-twitter-advanced-search";
const REDDIT_SEARCH_ACTOR =
  process.env.APIFY_REDDIT_SEARCH_ACTOR ?? "practicaltools~apify-reddit-api";

function s(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

// derive an X advanced-search query from the agent's icp + the signal intent.
// the user controls the terms via the agent's icp.industry / icp.keywords; the
// template wraps them in the intent phrasing per signal type. an explicit query
// override always wins.
export function buildSearchQuery(
  signalType: SignalType,
  icp: Record<string, unknown>,
): string {
  const keywords = Array.isArray(icp.keywords) ? (icp.keywords as unknown[]) : [];
  const industry = Array.isArray(icp.industry) ? (icp.industry as unknown[]) : [];
  const terms = [...keywords, ...industry]
    .map(s)
    .filter(Boolean)
    .slice(0, 4);
  const cat = terms.length ? terms.map((t) => `"${t}"`).join(" OR ") : "tool";
  switch (signalType) {
    case "searching_for":
      return `("looking for" OR "anyone know" OR "recommendations for" OR "any good") (${cat})`;
    case "tool_mention":
      return cat;
    case "product_launch":
      return `("just launched" OR "launching" OR "introducing") (${cat})`;
    default:
      return cat;
  }
}

export type XSearchResult = {
  raws: Record<string, unknown>[];
  query: string;
  error?: string;
};

// run the X search actor through the key pool + normalize. nowIso is injected so
// detected_at is set by the caller (server action), not guessed here.
export async function searchXSignals(args: {
  signalType: SignalType;
  icp: Record<string, unknown>;
  query?: string;
  max?: number;
  nowIso: string;
}): Promise<XSearchResult> {
  const query =
    (args.query ?? "").trim() || buildSearchQuery(args.signalType, args.icp);
  const max = Math.min(Math.max(args.max ?? 25, 1), 50);

  const run = await runApifyActorPooled(
    X_SEARCH_ACTOR,
    { query, maxItems: max },
    120000,
  );
  if (!run.ok) return { raws: [], query, error: run.error };

  const raws: Record<string, unknown>[] = [];
  for (const it of run.items as Record<string, unknown>[]) {
    const handle = s(it.screen_name) || s(it.userName);
    const id = s(it.tweet_id) || s(it.id);
    const text = s(it.text) || s(it.full_text);
    if (!id || !text) continue;
    raws.push({
      source_id: `x_${id}`,
      post_url: handle ? `https://x.com/${handle}/status/${id}` : "",
      platform: "x",
      author_handle: handle,
      author_name: handle,
      author_profile_url: handle ? `https://x.com/${handle}` : "",
      post_text: text,
      // for searching_for the post IS the matched need; the drafter opens on it.
      matched_need: text,
      // do NOT backfill mentioned_tool/category from the boolean query ... that
      // made the hook render `mentioned "fintech" OR "saas"`. leave them empty so
      // hookFromHit falls back cleanly + the flame floor doesn't false-match a
      // category. a named competitor can be extracted from post_text later.
      mentioned_tool: "",
      category: "",
      posted_at: s(it.created_at),
      detected_at: args.nowIso,
    });
  }
  return { raws, query };
}

// reddit search is plain keywords (no X boolean operators). keep it simple ... the
// category terms, plus an intent word for searching_for.
export function buildRedditQuery(icp: Record<string, unknown>): string {
  const keywords = Array.isArray(icp.keywords) ? (icp.keywords as unknown[]) : [];
  const industry = Array.isArray(icp.industry) ? (icp.industry as unknown[]) : [];
  // reddit search yields little on long phrases ... keep it to the broad category
  // terms (a la "saas"); the scorer separates intent from noise downstream.
  const terms = [...keywords, ...industry].map(s).filter(Boolean).slice(0, 2);
  return terms.length ? terms.join(" ") : "tool";
}

// run the reddit search actor through the pool + normalize the practicaltools
// shape (verified live: id/parsedId, url, username, title, communityName, body,
// createdAt) to the same raw contract. post_text folds title + body.
export async function searchRedditSignals(args: {
  signalType: SignalType;
  icp: Record<string, unknown>;
  query?: string;
  max?: number;
  nowIso: string;
}): Promise<XSearchResult> {
  const query = (args.query ?? "").trim() || buildRedditQuery(args.icp);
  const max = Math.min(Math.max(args.max ?? 15, 1), 30);

  // practicaltools manages its own proxy + rejects extra fields ... keep the
  // input minimal (verified live: searches + maxItems).
  const run = await runApifyActorPooled(
    REDDIT_SEARCH_ACTOR,
    { searches: [query], maxItems: max },
    120000,
  );
  if (!run.ok) return { raws: [], query, error: run.error };

  const raws: Record<string, unknown>[] = [];
  for (const it of run.items as Record<string, unknown>[]) {
    const id = s(it.id) || s(it.parsedId);
    const title = s(it.title);
    const body = s(it.body);
    const text = [title, body].filter(Boolean).join(" ... ");
    if (!id || !text) continue;
    const username = s(it.username);
    raws.push({
      source_id: `rd_${id}`,
      post_url: s(it.url),
      platform: "reddit",
      author_handle: username,
      author_name: username,
      author_profile_url: username ? `https://reddit.com/user/${username}` : "",
      post_text: text,
      matched_need: text,
      mentioned_tool: "",
      category: s(it.communityName),
      posted_at: s(it.createdAt),
      detected_at: args.nowIso,
    });
  }
  return { raws, query };
}
