import type { LlmProvider } from "@/shared/llm/providers";

/** catalogUpdatedAt: 2026-07 — see provider docs when refreshing. */
export type LlmCatalogEntry = {
  id: string;
  label: string;
  note?: string;
};

type CatalogModelId<C extends readonly { readonly id: string }[]> =
  C[number]["id"];

export const LLM_CATALOG = {
  openai: [
    {
      id: "gpt-5.5",
      label: "GPT-5.5",
      note: "Frontier reasoning and coding",
    },
    { id: "gpt-5.4", label: "GPT-5.4" },
    {
      id: "gpt-5.4-mini",
      label: "GPT-5.4 mini",
      note: "Recommended default",
    },
    { id: "gpt-5.4-nano", label: "GPT-5.4 nano", note: "Lowest cost" },
    { id: "gpt-4o", label: "GPT-4o", note: "Legacy" },
  ],
  anthropic: [
    {
      id: "claude-sonnet-5",
      label: "Claude Sonnet 5",
      note: "Recommended default",
    },
    { id: "claude-haiku-4-5", label: "Claude Haiku 4.5", note: "Fastest" },
    { id: "claude-opus-4-8", label: "Claude Opus 4.8" },
    { id: "claude-fable-5", label: "Claude Fable 5", note: "Long-running agents" },
    { id: "claude-sonnet-4-5", label: "Claude Sonnet 4.5", note: "Legacy" },
    { id: "claude-opus-4-6", label: "Claude Opus 4.6", note: "Legacy" },
  ],
  xai: [
    { id: "grok-4.3", label: "Grok 4.3", note: "Recommended default" },
    {
      id: "grok-4.20-0309-reasoning",
      label: "Grok 4.20 reasoning",
    },
    {
      id: "grok-4.20-0309-non-reasoning",
      label: "Grok 4.20 non-reasoning",
    },
    { id: "grok-build-0.1", label: "Grok Build 0.1", note: "Coding (256k ctx)" },
  ],
  gemini: [
    {
      id: "gemini-3.5-flash",
      label: "Gemini 3.5 Flash",
      note: "Recommended default",
    },
    {
      id: "gemini-3.1-flash-lite",
      label: "Gemini 3.1 Flash-Lite",
      note: "Cost-efficient",
    },
    {
      id: "gemini-3.1-pro-preview",
      label: "Gemini 3.1 Pro Preview",
      note: "Complex reasoning",
    },
    {
      id: "gemini-2.5-flash",
      label: "Gemini 2.5 Flash",
      note: "Stable until Oct 2026",
    },
    {
      id: "gemini-2.5-pro",
      label: "Gemini 2.5 Pro",
      note: "Stable until Oct 2026",
    },
    { id: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash-Lite" },
  ],
  "openai-compatible": [],
} as const satisfies Record<LlmProvider, readonly LlmCatalogEntry[]>;

export const LLM_DEFAULT_MODEL = {
  openai: "gpt-5.4-mini",
  anthropic: "claude-sonnet-5",
  xai: "grok-4.3",
  gemini: "gemini-3.5-flash",
} as const satisfies {
  [P in Exclude<LlmProvider, "openai-compatible">]: CatalogModelId<
    (typeof LLM_CATALOG)[P]
  >;
};

export function defaultModelForProvider(provider: LlmProvider): string {
  if (provider === "openai-compatible") {
    return "";
  }
  return LLM_DEFAULT_MODEL[provider];
}
