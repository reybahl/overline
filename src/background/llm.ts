import { generateText } from "ai";

import { getLlmEnv, llmConfigHint } from "@/shared/env";
import { resolveLanguageModel } from "@/shared/llm-model";

export async function generateMacroSuggestion(prompt: string): Promise<string> {
  const env = getLlmEnv();
  if (!env) {
    return `LLM not configured.\n${llmConfigHint()}`;
  }

  const result = await generateText({
    model: resolveLanguageModel(env.model),
    prompt,
  });

  return result.text;
}
