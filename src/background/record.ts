import { captureDomInTab, getTabUrl } from "@/background/capture";
import { sendContentMessage } from "@/background/inject";
import { settleAfterStep } from "@/background/tab-settle";
import { getNextStep } from "@/background/worker";
import {
  createMacroPreview,
  toRecordedStep,
  type Macro,
  type MacroGenerationStep,
  type MacroStep,
} from "@/shared/types/macro";

const MAX_TURNS = 15;

export type AgenticRecordResult = {
  macro: Macro;
  reasoning: string[];
};

function stepSignature(step: MacroGenerationStep): string {
  return JSON.stringify({
    type: step.type,
    selector: step.selector ?? "",
    value: step.value ?? "",
  });
}

function isRepeatedStep(steps: MacroStep[], next: MacroGenerationStep): boolean {
  if (steps.length === 0) return false;
  const last = steps[steps.length - 1];
  return (
    stepSignature({
      type: last.type,
      selector: last.selector,
      value: last.value,
    }) === stepSignature(next)
  );
}

/** Detects A → B → A oscillation (e.g. PRs → labels → PRs). */
function wouldOscillate(steps: MacroStep[], next: MacroGenerationStep): boolean {
  if (steps.length < 2) return false;

  const nextSig = stepSignature(next);
  const lastSig = stepSignature({
    type: steps[steps.length - 1].type,
    selector: steps[steps.length - 1].selector,
    value: steps[steps.length - 1].value,
  });
  const prevSig = stepSignature({
    type: steps[steps.length - 2].type,
    selector: steps[steps.length - 2].selector,
    value: steps[steps.length - 2].value,
  });

  return nextSig === prevSig && nextSig !== lastSig;
}

export async function runAgenticRecord(
  intent: string,
  tabId: number,
  startUrl: string,
  onProgress?: (message: string) => void,
): Promise<AgenticRecordResult> {
  const recordedSteps: MacroStep[] = [];
  const reasoning: string[] = [];
  let lastError: string | undefined;
  let macroName = intent;

  for (let turn = 0; turn < MAX_TURNS; turn += 1) {
    onProgress?.(`Thinking (step ${turn + 1})…`);

    const url = await getTabUrl(tabId);
    const elements = await captureDomInTab(tabId);
    const turnResult = await getNextStep(
      intent,
      recordedSteps.map((step) => ({
        type: step.type,
        selector: step.selector,
        value: step.value,
      })),
      elements,
      url,
      lastError,
    );

    if (turnResult.reasoning) {
      reasoning.push(turnResult.reasoning);
    }

    if (turnResult.macroName) {
      macroName = turnResult.macroName;
    }

    lastError = undefined;

    if (turnResult.done) {
      break;
    }

    if (wouldOscillate(recordedSteps, turnResult.step)) {
      reasoning.push(
        "Stopped recording: detected navigation loop (revisiting a previous page).",
      );
      break;
    }

    if (isRepeatedStep(recordedSteps, turnResult.step)) {
      throw new Error(
        "Recording got stuck repeating the same step. Try a simpler intent.",
      );
    }

    const recordedStep = toRecordedStep(turnResult.step);
    recordedSteps.push(recordedStep);

    onProgress?.(
      `Running step ${recordedSteps.length}: ${recordedStep.type}${
        recordedStep.selector ? ` ${recordedStep.selector}` : ""
      }`,
    );

    const response = await sendContentMessage(tabId, {
      type: "EXECUTE_STEPS",
      steps: [recordedStep],
    });

    if (!response.ok) {
      lastError = response.error;
      recordedSteps.pop();
      continue;
    }

    await settleAfterStep(tabId);
  }

  if (recordedSteps.length === 0) {
    throw new Error("Recording finished without any steps.");
  }

  return {
    macro: createMacroPreview(macroName, recordedSteps, startUrl),
    reasoning,
  };
}
