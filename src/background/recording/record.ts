import { runAgentLoop } from "@/background/recording/agent-loop";
import { createMacroPreview, type Macro } from "@/shared/types/macro";

export type AgenticRecordResult = {
  macro: Macro;
  reasoning: string[];
};

export async function runAgenticRecord(
  intent: string,
  tabId: number,
  startUrl: string,
  onProgress?: (message: string) => void,
): Promise<AgenticRecordResult> {
  const result = await runAgentLoop({
    intent,
    tabId,
    onProgress,
  });

  return {
    macro: createMacroPreview(result.macroName ?? intent, result.steps, startUrl, {
      intent,
    }),
    reasoning: result.reasoning,
  };
}
