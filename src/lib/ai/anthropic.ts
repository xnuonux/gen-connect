import { createOpenAI } from "@ai-sdk/openai";

const openrouter = createOpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY!,
  headers: {
    "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3001",
    "X-Title": "gen connect",
  },
});

export const models = {
  planner: openrouter("anthropic/claude-opus-4.5"),
  drafter: openrouter("anthropic/claude-sonnet-4.5"),
  judge: openrouter("anthropic/claude-opus-4.5"),
  scout: openrouter("anthropic/claude-haiku-4.5"),
  plannerCheap: openrouter("deepseek/deepseek-reasoner"),
  drafterCheap: openrouter("deepseek/deepseek-chat"),
  scoutCheap: openrouter("deepseek/deepseek-chat"),
} as const;

export const provider = openrouter;
