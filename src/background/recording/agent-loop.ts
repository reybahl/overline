import { captureDomInTab, getTabUrl } from "@/background/capture";
import { sendContentMessage } from "@/background/inject";
import { assertRecordingSessionActive } from "@/background/recording/recording-session";
import { settleAfterStep } from "@/background/playback/tab-settle";
import { getNextStep } from "@/background/recording/worker";
import { createLogger } from "@/shared/logger";
import {
  toRecordedStep,
  type MacroGenerationStep,
  type MacroStep,
} from "@/shared/types/macro";

const log = createLogger("agent");

const DEFAULT_MAX_TURNS = 15;

/** How many times the agent may re-propose the same step before we stop. */
const MAX_CONSECUTIVE_REPEATS = 2;

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
  macroDescription?: string;
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
  let macroDescription: string | undefined;
  let consecutiveRepeats = 0;
  let lastFailedSignature: string | undefined;
  let consecutiveFailedProposals = 0;
  let exitReason: string | undefined;

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

    log.info("agent turn", {
      turn: turn + 1,
      done: turnResult.done,
      stepType: turnResult.step.type,
      selector: turnResult.step.selector,
      elementCount: elements.length,
      url,
      reasoning: turnResult.reasoning,
      lastError,
    });

    if (turnResult.reasoning) {
      reasoning.push(turnResult.reasoning);
    }

    if (turnResult.macroName) {
      macroName = turnResult.macroName;
    }

    if (turnResult.macroDescription) {
      macroDescription = turnResult.macroDescription;
    }

    lastError = undefined;

    if (turnResult.done) {
      if (stepsTaken.length === 0) {
        lastError =
          "You returned done: true but no steps have been recorded yet. " +
          "The intent is not complete — return done: false and emit the next click step.";
        continue;
      }

      exitReason = "model marked intent complete";
      break;
    }

    if (turnResult.step.type === "navigate") {
      lastError =
        "Do not use navigate steps. Click the link or button instead.";
      continue;
    }

    if (wouldOscillate(stepsTaken, turnResult.step)) {
      exitReason = "navigation loop detected";
      reasoning.push(
        "Stopped recording: detected navigation loop (revisiting a previous page).",
      );
      break;
    }

    if (isRepeatedStep(stepsTaken, turnResult.step)) {
      consecutiveRepeats += 1;

      if (consecutiveRepeats >= MAX_CONSECUTIVE_REPEATS) {
        exitReason = "repeated step with no effect";
        reasoning.push(
          "Stopped recording: the same step was proposed repeatedly with no visible effect.",
        );
        break;
      }

      lastError =
        "That step matches the one you just took and the page state is unchanged. " +
        "Check the state fields (selected/pressed/checked/expanded) — if the target is already active, " +
        "move on to the next part of the intent or set done: true. Otherwise pick a different element.";
      continue;
    }

    consecutiveRepeats = 0;

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

      const failedSignature = stepSignature(turnResult.step);
      if (failedSignature === lastFailedSignature) {
        consecutiveFailedProposals += 1;
      } else {
        lastFailedSignature = failedSignature;
        consecutiveFailedProposals = 1;
      }

      if (consecutiveFailedProposals >= MAX_CONSECUTIVE_REPEATS) {
        exitReason = "step execution failed repeatedly";
        lastError = response.error;
        break;
      }

      continue;
    }

    lastFailedSignature = undefined;
    consecutiveFailedProposals = 0;

    await settleAfterStep(tabId, urlBeforeStep);
  }

  if (stepsTaken.length === 0) {
    const detail =
      lastError ??
      exitReason ??
      (reasoning.length > 0 ? reasoning[reasoning.length - 1] : undefined) ??
      "The model did not produce any executable steps.";
    throw new Error(`Recording finished without any steps. ${detail}`);
  }

  return { steps: stepsTaken, reasoning, macroName, macroDescription };
}
