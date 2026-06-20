import { getTabUrl } from "@/background/capture";
import { sendContentMessage } from "@/background/inject";
import { settleAfterStep, STEP_WAIT_FOR_MS } from "@/background/tab-settle";
import type { Macro, MacroStep } from "@/shared/types/macro";
import type { ElementMatch, MacroScript, ScriptStep } from "@/shared/types/script";

function stepNeedsElement(step: MacroStep): boolean {
  return (
    (step.type === "click" ||
      step.type === "type" ||
      step.type === "fill" ||
      step.type === "scroll") &&
    Boolean(step.selector)
  );
}

function scriptStepNeedsSettle(step: ScriptStep): boolean {
  return step.type === "click";
}

async function waitForSelectorInTab(
  tabId: number,
  selector: string,
  timeoutMs = STEP_WAIT_FOR_MS,
): Promise<void> {
  const response = await sendContentMessage(tabId, {
    type: "EXECUTE_STEPS",
    steps: [
      {
        id: crypto.randomUUID(),
        type: "waitFor",
        selector,
        value: String(timeoutMs),
        timestamp: Date.now(),
      },
    ],
  });
  if (!response.ok) {
    throw new Error(response.error);
  }
}

export async function runMacroSteps(
  tabId: number,
  steps: MacroStep[],
): Promise<void> {
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];

    if (i > 0 && stepNeedsElement(step)) {
      await waitForSelectorInTab(tabId, step.selector!);
    }

    const urlBeforeStep =
      step.type === "click" || step.type === "navigate"
        ? await getTabUrl(tabId)
        : undefined;

    const response = await sendContentMessage(tabId, {
      type: "EXECUTE_STEPS",
      steps: [step],
    });
    if (!response.ok) {
      throw new Error(response.error);
    }

    if (step.type === "click" || step.type === "navigate") {
      await settleAfterStep(tabId, urlBeforeStep);
    }
  }
}

async function waitForScriptMatchInTab(
  tabId: number,
  match: ElementMatch,
  timeoutMs = STEP_WAIT_FOR_MS,
): Promise<void> {
  const response = await sendContentMessage(tabId, {
    type: "EXECUTE_SCRIPT",
    steps: [
      {
        type: "waitFor",
        match,
        timeoutMs,
      },
    ],
  });
  if (!response.ok) {
    throw new Error(response.error);
  }
}

export async function runMacroScript(
  tabId: number,
  script: MacroScript,
): Promise<void> {
  for (let i = 0; i < script.steps.length; i++) {
    const step = script.steps[i];

    if (i > 0 && step.type === "click") {
      await waitForScriptMatchInTab(tabId, step.match);
    }

    const urlBeforeStep =
      step.type === "click" ? await getTabUrl(tabId) : undefined;

    const response = await sendContentMessage(tabId, {
      type: "EXECUTE_SCRIPT",
      steps: [step],
    });
    if (!response.ok) {
      throw new Error(response.error);
    }

    if (scriptStepNeedsSettle(step)) {
      await settleAfterStep(tabId, urlBeforeStep);
    }
  }
}

export async function runMacro(tabId: number, macro: Macro): Promise<void> {
  if (macro.script) {
    await runMacroScript(tabId, macro.script);
    return;
  }

  await runMacroSteps(tabId, macro.steps);
}
