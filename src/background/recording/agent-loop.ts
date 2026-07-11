import {
  captureDomInTab,
  getTabUrl,
  listInteractivesInTab,
  searchInteractivesInTab,
} from "@/background/capture";
import { sendContentMessage } from "@/background/inject";
import { settleAfterStep } from "@/background/playback/tab-settle";
import { assertRecordingSessionActive } from "@/background/recording/recording-session";
import {
  AgentTurnValidationError,
  getNextStep,
} from "@/background/recording/worker";
import { createLogger } from "@/shared/logger";
import {
  toRecordedStep,
  type AgentTurn,
  type MacroGenerationStep,
  type MacroStep,
} from "@/shared/types/macro";

const log = createLogger("agent");

const DEFAULT_MAX_TURNS = 15;

/** How many times the agent may re-propose the same step before we stop. */
const MAX_CONSECUTIVE_REPEATS = 2;

/** Stop if this many turns record no new successful step (fruitless searching). */
const MAX_CONSECUTIVE_NO_PROGRESS = 3;

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

type StepExecution = { ok: true } | { ok: false; error: string };

async function executeAndRecordStep(
  tabId: number,
  step: MacroStep,
): Promise<StepExecution> {
  const urlBeforeStep = await getTabUrl(tabId);

  const response = await sendContentMessage(tabId, {
    type: "EXECUTE_STEPS",
    steps: [step],
  });

  if (!response.ok) {
    return { ok: false, error: response.error };
  }

  if (step.type === "click" || step.type === "fill") {
    step.pageUrl = urlBeforeStep;
  }

  step.recordedMatch = response.matches?.[0] ?? undefined;
  await settleAfterStep(tabId, urlBeforeStep);
  return { ok: true };
}

function describeRunningStep(index: number, step: MacroStep): string {
  return `Running step ${index}: ${step.type}${
    step.selector ? ` ${step.selector}` : ""
  }${step.value ? ` → ${step.value}` : ""}`;
}

export async function runAgentLoop(
  options: AgentLoopOptions,
): Promise<AgentLoopResult> {
  const { intent, tabId, maxTurns = DEFAULT_MAX_TURNS, onProgress } = options;

  const stepsTaken: MacroStep[] = [];
  const reasoning: string[] = [];
  let lastError: string | undefined;
  let consecutiveRepeats = 0;
  let lastFailedSignature: string | undefined;
  let consecutiveFailedProposals = 0;
  let consecutiveNoProgress = 0;
  let exitReason: string | undefined;
  let macroName: string | undefined;

  for (let turn = 0; turn < maxTurns; turn += 1) {
    await assertRecordingSessionActive();

    onProgress?.(`Thinking (step ${turn + 1})…`);

    const stepsBeforeTurn = stepsTaken.length;
    const url = await getTabUrl(tabId);
    const elements = await captureDomInTab(tabId);
    let turnResult: AgentTurn;
    try {
      turnResult = await getNextStep(
        intent,
        stepsTaken.map((step) => ({
          type: step.type,
          selector: step.selector,
          value: step.value,
        })),
        elements,
        url,
        {
          searchElements: (query, options) =>
            searchInteractivesInTab(tabId, query, options),
          listElements: (options) => listInteractivesInTab(tabId, options),
        },
        lastError,
      );
    } catch (error) {
      if (error instanceof AgentTurnValidationError) {
        lastError = error.message;
        consecutiveNoProgress += 1;
        if (consecutiveNoProgress >= MAX_CONSECUTIVE_NO_PROGRESS) {
          exitReason = "no progress after repeated failed proposals";
          reasoning.push(
            "Stopped recording: could not find a matching control for the intent after several attempts.",
          );
          break;
        }
        continue;
      }
      throw error;
    }

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

    lastError = undefined;

    if (turnResult.done) {
      if (stepsTaken.length === 0) {
        lastError =
          "You returned done: true but no steps have been recorded yet. " +
          "The intent is not complete — return done: false and emit the next click step.";
        consecutiveNoProgress += 1;
        if (consecutiveNoProgress >= MAX_CONSECUTIVE_NO_PROGRESS) {
          exitReason = "no progress after repeated failed proposals";
          reasoning.push(
            "Stopped recording: could not find a matching control for the intent after several attempts.",
          );
          break;
        }
        continue;
      }

      const finalStep = turnResult.step;
      const isNewAction =
        Boolean(finalStep.selector) &&
        finalStep.type !== "navigate" &&
        !isRepeatedStep(stepsTaken, finalStep) &&
        !wouldOscillate(stepsTaken, finalStep);

      if (isNewAction) {
        const step = toRecordedStep(finalStep);
        stepsTaken.push(step);
        onProgress?.(describeRunningStep(stepsTaken.length, step));

        const exec = await executeAndRecordStep(tabId, step);
        if (!exec.ok) {
          stepsTaken.pop();
          lastError = exec.error;
        }
      }

      exitReason = "model marked intent complete";
      break;
    }

    if (turnResult.step.type === "navigate") {
      lastError =
        "Do not use navigate steps. Click the link or button instead.";
      consecutiveNoProgress += 1;
      if (consecutiveNoProgress >= MAX_CONSECUTIVE_NO_PROGRESS) {
        exitReason = "no progress after repeated failed proposals";
        break;
      }
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

    onProgress?.(describeRunningStep(stepsTaken.length, step));

    const exec = await executeAndRecordStep(tabId, step);

    if (!exec.ok) {
      lastError = exec.error;
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
        break;
      }

      consecutiveNoProgress += 1;
      if (consecutiveNoProgress >= MAX_CONSECUTIVE_NO_PROGRESS) {
        exitReason = "no progress after repeated failed proposals";
        reasoning.push(
          "Stopped recording: could not find a matching control for the intent after several attempts.",
        );
        break;
      }

      continue;
    }

    lastFailedSignature = undefined;
    consecutiveFailedProposals = 0;

    if (stepsTaken.length > stepsBeforeTurn) {
      consecutiveNoProgress = 0;
    } else {
      consecutiveNoProgress += 1;
      if (consecutiveNoProgress >= MAX_CONSECUTIVE_NO_PROGRESS) {
        exitReason = "no progress after repeated failed proposals";
        reasoning.push(
          "Stopped recording: could not find a matching control for the intent after several attempts.",
        );
        break;
      }
    }
  }

  if (stepsTaken.length === 0) {
    const detail =
      lastError ??
      exitReason ??
      (reasoning.length > 0 ? reasoning[reasoning.length - 1] : undefined) ??
      "The model did not produce any executable steps.";
    throw new Error(`Recording finished without any steps. ${detail}`);
  }

  return { steps: stepsTaken, reasoning, macroName };
}
