import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// per-user sliding-window rate limit on /api/gen. a streaming agent turn is
// heavy (real money per call), so we cap bursts. DEGRADES TO ALWAYS-ALLOW when
// upstash isn't configured (local dev has no redis) ... so it never blocks
// development, only protects a deployed multi-user instance.

const hasUpstash =
  !!process.env.UPSTASH_REDIS_REST_URL && !!process.env.UPSTASH_REDIS_REST_TOKEN;

// module-scope singleton so the connection + window are reused across requests.
const limiter = hasUpstash
  ? new Ratelimit({
      redis: Redis.fromEnv(),
      limiter: Ratelimit.slidingWindow(
        Number(process.env.GEN_RATE_LIMIT_MAX ?? 20), // owner-tunable
        "1 m",
      ),
      prefix: "gen",
      analytics: false,
    })
  : null;

export async function checkGenRateLimit(
  userId: string,
): Promise<{ success: boolean }> {
  if (!limiter) return { success: true };
  try {
    const { success } = await limiter.limit(`gen:${userId}`);
    return { success };
  } catch {
    // if redis is unreachable, fail OPEN ... a transient limiter outage should
    // not take the copilot down. the daily cost ceiling is the harder backstop.
    return { success: true };
  }
}
