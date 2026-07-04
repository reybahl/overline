/**
 * Trace macro signature inference against the user's PR #X case.
 * Run: bun --env-file=.env scripts/trace-macro-signature.ts
 */
import { generateObject } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createXai } from "@ai-sdk/xai";

import { applyInferredMacroSignature } from "../src/shared/macro-signature.ts";
import { InferredMacroSignatureSchema } from "../src/shared/types/macro-signature.ts";

const INTENT =
  "click PR #X (where X is the pr number that i give as input)";

const SCRIPT = {
  version: 1 as const,
  steps: [
    {
      type: "click" as const,
      match: { id: "issue_1980_link" },
    },
  ],
};

const DEMO = [
  {
    type: "click" as const,
    pageUrl: "https://github.com/coursetable/coursetable/pulls",
    recordedMatch: { id: "issue_1980_link", hrefSuffix: "/pull/1980" },
  },
];

const PROMPT = [
  "Return standalone: false when intent marks user-provided PR number.",
  `Intent: "${INTENT}"`,
  "Compiled script:",
  JSON.stringify(SCRIPT.steps, null, 2),
  "Demo:",
  JSON.stringify(DEMO, null, 2),
  "Patch match.id to issue_{{prNumber}}_link or match.hrefContains to /pull/{{prNumber}}",
].join("\n");

const apiKey =
  process.env.VITE_XAI_API_KEY ??
  process.env.VITE_OPENAI_API_KEY ??
  process.env.VITE_ANTHROPIC_API_KEY;
const provider = process.env.VITE_LLM_PROVIDER ?? "xai";
const modelId = process.env.VITE_LLM_MODEL ?? "grok-3-fast";

if (!apiKey) {
  throw new Error("Set an API key in .env");
}

function resolveModel() {
  switch (provider) {
    case "anthropic":
      return createAnthropic({ apiKey })(modelId);
    case "google":
      return createGoogleGenerativeAI({ apiKey })(modelId);
    case "openai":
      return createOpenAI({ apiKey })(modelId);
    case "xai":
      return createXai({ apiKey })(modelId);
    case "openai-compatible":
      return createOpenAICompatible({
        name: "openai-compatible",
        apiKey,
        baseURL: process.env.VITE_LLM_BASE_URL ?? "http://localhost:11434/v1",
      })(modelId);
    default:
      return createXai({ apiKey })(modelId);
  }
}

const model = resolveModel();
console.log(`Provider: ${provider}, model: ${modelId}\n`);

const result = await generateObject({
  model,
  schema: InferredMacroSignatureSchema,
  prompt: PROMPT,
});

console.log("LLM output:", JSON.stringify(result.object, null, 2));

const applied = applyInferredMacroSignature(SCRIPT, result.object);
console.log("\nApplied signature:", JSON.stringify(applied.signature, null, 2));
console.log("Applied script:", JSON.stringify(applied.script, null, 2));
