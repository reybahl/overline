import { captureDomInTab, getTabUrl } from "@/background/capture";
import { sendContentMessage } from "@/background/inject";
import { assertRecordingSessionActive } from "@/background/recording-session";
import { settleAfterStep } from "@/background/tab-settle";
import { getNextStep } from "@/background/worker";
import {
  toRecordedStep,
  type MacroGenerationStep,
  type MacroStep,
} from "@/shared/types/macro";

const DEFAULT_MAX_TURNS = 15;

export type AgentLoopOptions = {
  intent: string;
  tabId: number;
  maxTurns?: number;
  onProgress?: (message: string) => void;
};

export type AgentLoopResult = {
  steps: MacroStep[];
  reasoning: string[];
  macroName?: string;
};

function stepSignature(step: MacroGenerationStep): string {
  return JSON.stringify({
    type: step.type,
    selector: step.selector ?? "",
    value: step.value ?? "",
  });
}

function isRepeatedStep(steps: MacroStep[], next: MacroGenerationStep): boolean {
  if (steps.length === 0) {
    return false;
  }

  const last = steps[steps.length - 1];
  return (
    stepSignature({
      type: last.type,
      selector: last.selector,
      value: last.value,
    }) === stepSignature(next)
  );
}

function wouldOscillate(steps: MacroStep[], next: MacroGenerationStep): boolean {
  if (steps.length < 2) {
    return false;
  }

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

export async function runAgentLoop(
  options: AgentLoopOptions,
): Promise<AgentLoopResult> {
  const { intent, tabId, maxTurns = DEFAULT_MAX_TURNS, onProgress } = options;

  const stepsTaken: MacroStep[] = [];
  const reasoning: string[] = [];
  let lastError: string | undefined;
  let macroName: string | undefined;

  for (let turn = 0; turn < maxTurns; turn += 1) {
    await assertRecordingSessionActive();

    onProgress?.(`Thinking (step ${turn + 1})…`);

    const url = await getTabUrl(tabId);
    const elements = await captureDomInTab(tabId);
    const turnResult = await getNextStep(
      intent,
      stepsTaken.map((step) => ({
        type: step.type,
        selector: step.selector,
        value: step.value,
      })),
      elements,
      url,
      lastError,
    );

    await assertRecordingSessionActive();

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

    if (turnResult.step.type === "navigate") {
      lastError =
        "Do not use navigate steps. Click the link or button instead.";
      continue;
    }

    if (wouldOscillate(stepsTaken, turnResult.step)) {
      reasoning.push(
        "Stopped recording: detected navigation loop (revisiting a previous page).",
      );
      break;
    }

    if (isRepeatedStep(stepsTaken, turnResult.step)) {
      throw new Error(
        "Recording got stuck repeating the same step. Try a simpler intent.",
      );
    }

    const step = toRecordedStep(turnResult.step);
    stepsTaken.push(step);

    onProgress?.(
      `Running step ${stepsTaken.length}: ${step.type}${
        step.selector ? ` ${step.selector}` : ""
      }${step.value ? ` → ${step.value}` : ""}`,
    );

    const urlBeforeStep =
      step.type === "click" ? await getTabUrl(tabId) : undefined;

    const response = await sendContentMessage(tabId, {
      type: "EXECUTE_STEPS",
      steps: [step],
    });

    if (!response.ok) {
      lastError = response.error;
      stepsTaken.pop();
      continue;
    }

    await settleAfterStep(tabId, urlBeforeStep);
  }

  if (stepsTaken.length === 0) {
    throw new Error("Recording finished without any steps.");
  }

  return { steps: stepsTaken, reasoning, macroName };
}
