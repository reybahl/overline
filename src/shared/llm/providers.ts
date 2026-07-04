import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createXai } from "@ai-sdk/xai";
import type { LanguageModel } from "ai";

import type { LlmSettings } from "@/shared/llm/settings";

export const LLM_PROVIDERS = [
  "openai",
  "anthropic",
  "xai",
  "gemini",
  "openai-compatible",
] as const;

export type LlmProvider = (typeof LLM_PROVIDERS)[number];

export const LLM_NOT_CONFIGURED_MESSAGE =
  "LLM not configured. Open Overline options → AI settings.";

const PROVIDER_FACTORIES: {
  [P in LlmProvider]: (
    settings: Extract<LlmSettings, { provider: P }>,
  ) => LanguageModel;
} = {
  openai: (settings) => createOpenAI({ apiKey: settings.apiKey })(settings.modelId),
  anthropic: (settings) =>
    createAnthropic({ apiKey: settings.apiKey })(settings.modelId),
  xai: (settings) => createXai({ apiKey: settings.apiKey })(settings.modelId),
  gemini: (settings) =>
    createGoogleGenerativeAI({ apiKey: settings.apiKey })(settings.modelId),
  "openai-compatible": (settings) =>
    createOpenAICompatible({
      apiKey: settings.apiKey,
      baseURL: settings.baseURL,
      name: settings.name,
    })(settings.modelId),
};

export function resolveLanguageModel(settings: LlmSettings): LanguageModel {
  switch (settings.provider) {
    case "openai":
      return PROVIDER_FACTORIES.openai(settings);
    case "anthropic":
      return PROVIDER_FACTORIES.anthropic(settings);
    case "xai":
      return PROVIDER_FACTORIES.xai(settings);
    case "gemini":
      return PROVIDER_FACTORIES.gemini(settings);
    case "openai-compatible":
      return PROVIDER_FACTORIES["openai-compatible"](settings);
  }
}

export function providerLabel(provider: LlmProvider): string {
  switch (provider) {
    case "openai":
      return "OpenAI";
    case "anthropic":
      return "Anthropic";
    case "xai":
      return "xAI";
    case "gemini":
      return "Google Gemini";
    case "openai-compatible":
      return "OpenAI-compatible";
  }
}
