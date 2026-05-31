import { createOpenAI } from "@ai-sdk/openai";

const openrouter = createOpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY!,
  headers: {
    "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3001",
    "X-Title": "gen connect",
  },
});

// direct deepseek (own key, not proxied through openrouter) ... the
// cost-conscious fallback path. the api is openai-compatible. real model ids
// from the deepseek /models endpoint: deepseek-v4-pro, deepseek-v4-flash.
const deepseek = createOpenAI({
  baseURL: "https://api.deepseek.com",
  apiKey: process.env.DEEPSEEK_API_KEY!,
});

// model aliases follow the routing spec in CLAUDE.md / AGENTS.md:
//   - planner / 5-angle synthesis / self-judge ... opus 4.7
//   - inline drafter / voice extraction / weekly learning loop ... sonnet 4.6
//   - signal scoring / icp exploration ... haiku 4.5
// the *Cheap + fallback aliases hit deepseek v4 directly ... the path we drop
// to when opus/sonnet is overkill, rate-limited, or down.
export const models = {
  planner: openrouter("anthropic/claude-opus-4.7"),
  drafter: openrouter("anthropic/claude-sonnet-4.6"),
  voiceExtractor: openrouter("anthropic/claude-sonnet-4.6"),
  judge: openrouter("anthropic/claude-opus-4.7"),
  scout: openrouter("anthropic/claude-haiku-4.5"),
  fallback: deepseek("deepseek-v4-pro"),
  plannerCheap: deepseek("deepseek-v4-pro"),
  drafterCheap: deepseek("deepseek-v4-flash"),
  scoutCheap: deepseek("deepseek-v4-flash"),
} as const;

export const provider = openrouter;
