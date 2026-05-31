import { createOpenAI } from "@ai-sdk/openai";

const openrouter = createOpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY!,
  headers: {
    "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3001",
    "X-Title": "gen connect",
  },
});

// model aliases follow the routing spec in CLAUDE.md / AGENTS.md:
//   - planner / 5-angle synthesis / self-judge ... opus 4.7
//   - inline drafter / voice extraction / weekly learning loop ... sonnet 4.6
//   - signal scoring / icp exploration ... haiku 4.5
// deepseek aliases stay parked as the cost-conscious fallback path.
export const models = {
  planner: openrouter("anthropic/claude-opus-4.7"),
  drafter: openrouter("anthropic/claude-sonnet-4.6"),
  voiceExtractor: openrouter("anthropic/claude-sonnet-4.6"),
  judge: openrouter("anthropic/claude-opus-4.7"),
  scout: openrouter("anthropic/claude-haiku-4.5"),
  plannerCheap: openrouter("deepseek/deepseek-reasoner"),
  drafterCheap: openrouter("deepseek/deepseek-chat"),
  scoutCheap: openrouter("deepseek/deepseek-chat"),
} as const;

export const provider = openrouter;
