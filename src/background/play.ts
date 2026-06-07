import { sendContentMessage } from "@/background/inject";
import { settleAfterStep } from "@/background/tab-settle";
import type { MacroStep } from "@/shared/types/macro";

const STEP_WAIT_FOR_MS = 8000;

function stepNeedsElement(step: MacroStep): boolean {
  return (
    (step.type === "click" ||
      step.type === "type" ||
      step.type === "fill" ||
      step.type === "scroll") &&
    Boolean(step.selector)
  );
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

    const response = await sendContentMessage(tabId, {
      type: "EXECUTE_STEPS",
      steps: [step],
    });
    if (!response.ok) {
      throw new Error(response.error);
    }

    if (step.type === "click" || step.type === "navigate") {
      await settleAfterStep(tabId);
    }
  }
}
