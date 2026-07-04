import { generateObject } from "ai";
import { z } from "zod";

import { resolveLanguageModel } from "@/shared/llm";
import type { LlmSettings } from "@/shared/llm/settings";

const TestConnectionSchema = z.object({
  ok: z.literal(true),
});

export async function testLlmConnection(settings: LlmSettings): Promise<void> {
  await generateObject({
    model: resolveLanguageModel(settings),
    schema: TestConnectionSchema,
    prompt: 'Reply with {"ok": true}.',
  });
}
