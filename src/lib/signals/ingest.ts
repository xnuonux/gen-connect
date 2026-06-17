import { runApifyActorPooled } from "@/lib/enrichment/apify-pool";
import { type SignalType } from "@/lib/types/signal";

// live signal ingestion off X (twitter). uses api-ninja/x-twitter-advanced-search
// (verified to run on the free tier + return real tweets, unlike apidojo which
// gates free runs). normalizes each tweet to the searching_for/tool_mention raw
// contract (docs/06) so the scorer + the feed + the drafter all read one shape.
// the actor is env-overridable; the default is the tested one.
const X_SEARCH_ACTOR =
  process.env.APIFY_X_SEARCH_ACTOR ?? "api-ninja~x-twitter-advanced-search";

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
      mentioned_tool: query,
      category: query,
      posted_at: s(it.created_at),
      detected_at: args.nowIso,
    });
  }
  return { raws, query };
}
