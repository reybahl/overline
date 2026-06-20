import { createGroq } from "@ai-sdk/groq";
import { createXai } from "@ai-sdk/xai";
import type { LanguageModel } from "ai";

const SUPPORTED_PROVIDERS = ["groq", "xai"] as const;

export type LlmProvider = (typeof SUPPORTED_PROVIDERS)[number];

export type ModelRef = {
  provider: LlmProvider;
  modelId: string;
  /** Full ref for logging, e.g. `xai:grok-4.20-0309-non-reasoning` */
  ref: string;
};

/** Accept `provider:model`, `provider/model`, bare model id + VITE_LLM_PROVIDER, or bare Groq id (legacy). */
export function parseModelRef(raw: string): ModelRef {
  const trimmed = raw.trim();
  const normalized = trimmed.replace("/", ":");
  const colonIdx = normalized.indexOf(":");

  if (colonIdx === -1) {
    const provider = readDefaultProvider();
    return {
      provider,
      modelId: trimmed,
      ref: `${provider}:${trimmed}`,
    };
  }

  const provider = normalized.slice(0, colonIdx).toLowerCase();
  const modelId = normalized.slice(colonIdx + 1);

  if (!SUPPORTED_PROVIDERS.includes(provider as LlmProvider)) {
    throw new Error(
      `Unknown LLM provider "${provider}". Use groq or xai, e.g. xai/grok-4.20-0309-non-reasoning.`,
    );
  }

  if (!modelId) {
    throw new Error(`Missing model id in "${raw}". Example: xai/grok-4.20-0309-non-reasoning`);
  }

  return {
    provider: provider as LlmProvider,
    modelId,
    ref: `${provider}:${modelId}`,
  };
}

function readDefaultProvider(): LlmProvider {
  const raw = import.meta.env.VITE_LLM_PROVIDER?.trim().toLowerCase();
  if (raw === "xai" || raw === "groq") {
    return raw;
  }
  return "groq";
}

export function getProviderApiKey(provider: LlmProvider): string | undefined {
  switch (provider) {
    case "groq":
      return import.meta.env.VITE_GROQ_API_KEY;
    case "xai":
      return import.meta.env.VITE_XAI_API_KEY;
  }
}

export function resolveLanguageModel(modelRef: string): LanguageModel {
  const { provider, modelId } = parseModelRef(modelRef);
  const apiKey = getProviderApiKey(provider);

  if (!apiKey) {
    throw new Error(
      `Missing API key for ${provider}. Set VITE_${provider.toUpperCase()}_API_KEY in .env.`,
    );
  }

  switch (provider) {
    case "groq":
      return createGroq({ apiKey })(modelId);
    case "xai":
      return createXai({ apiKey })(modelId);
  }
}

const GROQ_FALLBACK_MODELS = [
  "llama-3.3-70b-versatile",
  "llama-3.1-8b-instant",
] as const;

/** Models to try after the primary; only same-provider fallbacks. */
export function buildModelFallbackChain(primaryModelRef: string): string[] {
  const primary = parseModelRef(primaryModelRef);

  if (primary.provider !== "groq") {
    return [primary.ref];
  }

  const fallbacks = GROQ_FALLBACK_MODELS.map((modelId) => `groq:${modelId}`);
  return [...new Set([primary.ref, ...fallbacks])];
}
