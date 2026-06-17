// the apify key pool. gen connect holds several apify tokens (each with its own
// free monthly budget); this rotates across them with failover so one exhausted
// or rate-limited key never stalls a run ... gen just rolls to the next.
//
// OPERATIONAL source: APIFY_TOKEN_POOL env (comma/whitespace-separated), with a
// fallback to the single APIFY_TOKEN. the durable record + reset calendar lives
// in config/apify-pool.local.json (gitignored). when gen connect folds into the
// lunari ship, set APIFY_TOKEN_POOL in the lunari deploy env from that manifest
// and this module keeps working unchanged.
//
// note on terms: pooling free-tier keys to exceed a single account's budget is a
// gray area with apify's terms. the same failover also serves the legitimate
// resilience case (a revoked or rate-limited key). use deliberately.

// a key that errors sits out the warm instance for a bit. in-memory + best-effort
// (serverless instances are short-lived), so the real win is the per-call failover
// below ... the cooldown just de-prioritizes a known-bad key within an instance.
const COOLDOWN_MS = 60 * 60 * 1000; // 1h
const cooldownUntil = new Map<string, number>();

export function getApifyPool(): string[] {
  const raw = process.env.APIFY_TOKEN_POOL ?? process.env.APIFY_TOKEN ?? "";
  const keys = raw
    .split(/[,\s]+/)
    .map((k) => k.trim())
    .filter(Boolean);
  return Array.from(new Set(keys));
}

export type PooledRun =
  | { ok: true; items: unknown[]; keyIndex: number; triedKeys: number }
  | { ok: false; error: string; triedKeys: number };

// run an apify actor via run-sync-get-dataset-items, trying pool keys in order
// (least-recently-failed first) until one returns a 2xx dataset. any non-2xx or
// network error cools that key down and rolls to the next. returns the dataset
// items on the first success, or a clean error if every key failed.
export async function runApifyActorPooled(
  actorId: string,
  input: unknown,
  timeoutMs = 120000,
): Promise<PooledRun> {
  const pool = getApifyPool();
  if (pool.length === 0) {
    return { ok: false, error: "no apify keys configured", triedKeys: 0 };
  }

  const now = Date.now();
  // not-cooled-down keys first; a cooled key is only a last resort.
  const ordered = pool
    .map((key, index) => ({ key, index }))
    .sort(
      (a, b) =>
        (cooldownUntil.get(a.key) ?? 0) - (cooldownUntil.get(b.key) ?? 0),
    );

  let tried = 0;
  let lastError = "all apify keys failed";

  for (const { key, index } of ordered) {
    tried += 1;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(
        `https://api.apify.com/v2/acts/${encodeURIComponent(actorId)}/run-sync-get-dataset-items?token=${encodeURIComponent(key)}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(input),
          signal: ctrl.signal,
        },
      );
      if (!res.ok) {
        // 401/402/403/429/5xx ... bad/exhausted/rate-limited key. cool + roll on.
        cooldownUntil.set(key, now + COOLDOWN_MS);
        lastError = `apify http ${res.status}`;
        continue;
      }
      const data = (await res.json()) as unknown;
      return {
        ok: true,
        items: Array.isArray(data) ? data : [],
        keyIndex: index,
        triedKeys: tried,
      };
    } catch (e) {
      cooldownUntil.set(key, now + COOLDOWN_MS);
      lastError = e instanceof Error ? e.message : "apify call failed";
      continue;
    } finally {
      clearTimeout(timer);
    }
  }

  return { ok: false, error: lastError, triedKeys: tried };
}
