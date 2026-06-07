import { createGroq } from "@ai-sdk/groq";
import { generateText } from "ai";

import { getLlmEnv } from "@/shared/env";

export async function generateMacroSuggestion(prompt: string): Promise<string> {
  const env = getLlmEnv();
  if (!env) {
    return "LLM not configured. Set VITE_GROQ_API_KEY and VITE_GROQ_MODEL in .env.";
  }

  const groq = createGroq({ apiKey: env.apiKey });

  const result = await generateText({
    model: groq(env.model),
    prompt,
  });

  return result.text;
}
