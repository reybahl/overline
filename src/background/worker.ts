import { createGroq } from "@ai-sdk/groq";
import { generateObject } from "ai";
import type { z } from "zod";

import type { DomElement } from "@/content/dom-capture";
import { getLlmEnv } from "@/shared/env";
import {
  AgentTurnSchema,
  MacroGenerationSchema,
  toMacro,
  type AgentTurn,
  type Macro,
  type MacroGenerationStep,
} from "@/shared/types/macro";

const PRIMARY_MODEL = "gpt-oss-20b";
const FALLBACK_MODEL = "llama-3.3-70b-versatile";

function buildSingleShotPrompt(
  intent: string,
  elements: DomElement[],
  url: string,
): string {
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
    "- Use only step types: click, type, fill, confirm, navigate, wait, waitFor, scroll",
    "- Prefer stable selectors from the element list",
    "- For type/fill steps, put the text to enter in value",
    "- For click steps, use selector from the matching element",
    "- For wait steps, put milliseconds in value as a string (e.g. \"500\")",
    "- For waitFor steps, put timeout milliseconds in value and selector to wait for",
    "- Keep steps minimal and ordered",
    "- Name the macro concisely",
  ].join("\n");
}

function buildAgentTurnPrompt(
  intent: string,
  stepsSoFar: MacroGenerationStep[],
  elements: DomElement[],
  url: string,
  lastError?: string,
): string {
  return [
    "You are recording a browser automation macro one step at a time.",
    "",
    `Original intent: "${intent}"`,
    `Current URL: ${url}`,
    `Steps taken so far: ${JSON.stringify(stepsSoFar)}`,
    lastError ? `Last step failed: ${lastError}` : "",
    "",
    "Current page state:",
    JSON.stringify(elements, null, 2),
    "",
    "What is the single next step to take? Check Current URL first — set done: true if the intent is already satisfied.",
    "Rules:",
    "- For multi-step intents (e.g. \"go to X then Y\"), set done: true once the final destination is reached",
    "- Only use selectors from the current page state",
    "- Do not invent selectors",
    "- Use step types: click, type, fill, confirm, navigate, wait, waitFor, scroll",
    "- For wait, put milliseconds in value",
    "- For waitFor, put selector and timeout ms in value",
    "- Never navigate backwards — do not click a link that returns to a page you already visited",
    "- If the intent is already complete, return done: true and do not emit another step",
    "- If the intent cannot be completed, set done: true and explain in reasoning",
    "- When done: true, optionally set macroName to a short name for the macro",
  ]
    .filter(Boolean)
    .join("\n");
}

async function generateObjectWithModels<T>(
  schema: z.ZodType<T>,
  prompt: string,
): Promise<T> {
  const env = getLlmEnv();
  if (!env) {
    throw new Error(
      "LLM not configured. Set VITE_GROQ_API_KEY and VITE_GROQ_MODEL in .env.",
    );
  }

  const models = [...new Set([env.model, PRIMARY_MODEL, FALLBACK_MODEL])];
  let lastError: unknown;

  for (const model of models) {
    try {
      const groq = createGroq({ apiKey: env.apiKey });
      const result = await generateObject({
        model: groq(model),
        schema,
        prompt,
      });
      return result.object as T;
    } catch (error) {
      lastError = error;
      console.warn(`[Patch] Model ${model} failed, trying next…`, error);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("All Groq models failed.");
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

export async function getNextStep(
  intent: string,
  stepsSoFar: MacroGenerationStep[],
  elements: DomElement[],
  url: string,
  lastError?: string,
): Promise<AgentTurn> {
  if (elements.length === 0) {
    throw new Error("No DOM elements captured on this page.");
  }

  const prompt = buildAgentTurnPrompt(
    intent,
    stepsSoFar,
    elements,
    url,
    lastError,
  );

  return generateObjectWithModels<AgentTurn>(AgentTurnSchema, prompt);
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

  const prompt = buildSingleShotPrompt(intent, elements, url);
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
