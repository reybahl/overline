import { createGroq } from "@ai-sdk/groq";
import { generateObject } from "ai";

import type { DomElement } from "@/content/dom-capture";
import { getLlmEnv } from "@/shared/env";
import {
  MacroGenerationSchema,
  toMacro,
  type Macro,
} from "@/shared/types/macro";

const PRIMARY_MODEL = "gpt-oss-20b";
const FALLBACK_MODEL = "llama-3.3-70b-versatile";

function buildPrompt(intent: string, elements: DomElement[], url: string): string {
  return [
    "You generate browser automation macros for a Chrome extension.",
    "",
    `Current URL: ${url}`,
    `User intent: ${intent}`,
    "",
    "Available DOM elements (JSON):",
    JSON.stringify(elements, null, 2),
    "",
    "Return a macro that accomplishes the intent using only the listed elements.",
    "Rules:",
    "- Use only step types: click, type, navigate, wait, scroll",
    "- Prefer stable selectors from the element list",
    "- For type steps, put the text to enter in value",
    "- For click steps, use selector from the matching element",
    "- For wait steps, put milliseconds in value as a string (e.g. \"500\")",
    "- Keep steps minimal and ordered",
    "- Name the macro concisely",
  ].join("\n");
}

async function generateWithModel(
  apiKey: string,
  model: string,
  prompt: string,
  url: string,
): Promise<Macro> {
  const groq = createGroq({ apiKey });
  const result = await generateObject({
    model: groq(model),
    schema: MacroGenerationSchema,
    prompt,
  });

  return toMacro(result.object, url);
}

export async function generateMacro(
  intent: string,
  elements: DomElement[],
  url: string,
): Promise<Macro> {
  const env = getLlmEnv();
  if (!env) {
    throw new Error(
      "LLM not configured. Set VITE_GROQ_API_KEY and VITE_GROQ_MODEL in .env.",
    );
  }

  if (elements.length === 0) {
    throw new Error("No DOM elements captured. Run Capture DOM first.");
  }

  const prompt = buildPrompt(intent, elements, url);
  const models = [...new Set([env.model, PRIMARY_MODEL, FALLBACK_MODEL])];
  let lastError: unknown;

  for (const model of models) {
    try {
      return await generateWithModel(env.apiKey, model, prompt, url);
    } catch (error) {
      lastError = error;
      console.warn(`[Patch] Model ${model} failed, trying next…`, error);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("All Groq models failed to generate a macro.");
}
