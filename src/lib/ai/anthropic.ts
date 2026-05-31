import { createAnthropic } from "@ai-sdk/anthropic";
import { createDeepSeek } from "@ai-sdk/deepseek";

// two raw providers, no middleman. anthropic is the spec'd primary tier, but
// its key is out of credits right now, so the live aliases route to deepseek.
// to flip back when anthropic is funded, point each alias at its
// anthropicPrimary counterpart below.

// direct anthropic (raw api). raw model ids: opus 4.8 (claude-opus-4-8, the
// current newest), sonnet 4.6 (claude-sonnet-4-6), haiku 4.5 (claude-haiku-4-5).
const anthropic = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY ?? "",
});

// direct deepseek (official provider). uses deepseek's /chat/completions and
// its real capabilities ... critically, generateObject runs in tool-mode here,
// not the json_schema response_format that deepseek rejects.
const deepseek = createDeepSeek({
  apiKey: process.env.DEEPSEEK_API_KEY ?? "",
});

// parked until the anthropic key is funded ... swap the live aliases to these
// to switch the workspace back off deepseek.
const anthropicPrimary = {
  planner: anthropic("claude-opus-4-8"),
  drafter: anthropic("claude-sonnet-4-6"),
  voiceExtractor: anthropic("claude-sonnet-4-6"),
  judge: anthropic("claude-opus-4-8"),
  scout: anthropic("claude-haiku-4-5"),
} as const;
void anthropicPrimary;

export const models = {
  planner: deepseek("deepseek-v4-pro"),
  drafter: deepseek("deepseek-v4-pro"),
  voiceExtractor: deepseek("deepseek-v4-pro"),
  judge: deepseek("deepseek-v4-pro"),
  scout: deepseek("deepseek-v4-flash"),
  // funded-later primary; flip the aliases above to anthropicPrimary to use it.
  fallback: anthropic("claude-opus-4-8"),
  plannerCheap: deepseek("deepseek-v4-pro"),
  drafterCheap: deepseek("deepseek-v4-flash"),
  scoutCheap: deepseek("deepseek-v4-flash"),
} as const;

export const provider = deepseek;
