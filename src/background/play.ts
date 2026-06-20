import { getTabUrl } from "@/background/capture";
import { sendContentMessage } from "@/background/inject";
import { settleAfterStep, STEP_WAIT_FOR_MS } from "@/background/tab-settle";
import { clearRunId, createLogger, newRunId } from "@/shared/logger";
import type { Macro, MacroStep } from "@/shared/types/macro";
import type { ElementMatch, MacroScript, ScriptStep } from "@/shared/types/script";

const log = createLogger("play");

/**
 * Bring the target tab to the foreground before playback. Many interactions
 * (clipboard writes, focus-dependent widgets) only work when the tab is the
 * active tab in a focused window, mirroring what a real user would have.
 */
async function focusTabForPlayback(tabId: number): Promise<void> {
  try {
    const tab = await chrome.tabs.get(tabId);
    await chrome.tabs.update(tabId, { active: true });
    if (typeof tab.windowId === "number") {
      await chrome.windows.update(tab.windowId, { focused: true });
    }
  } catch (error) {
    log.warn("failed to focus tab before playback", {
      tabId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

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
    const stepNum = `${i + 1}/${script.steps.length}`;

    if (i > 0 && step.type === "click") {
      log.debug("pre-click wait", { step: stepNum, type: step.type, label: step.label });
      await waitForScriptMatchInTab(tabId, step.match);
    }

    const urlBeforeStep =
      step.type === "click" ? await getTabUrl(tabId) : undefined;

    log.info("executing step", { step: stepNum, type: step.type, label: step.label });

    const response = await sendContentMessage(tabId, {
      type: "EXECUTE_SCRIPT",
      steps: [step],
    });
    if (!response.ok) {
      log.error("step failed", {
        step: stepNum,
        type: step.type,
        label: step.label,
        error: response.error,
      });
      throw new Error(response.error);
    }

    if (scriptStepNeedsSettle(step)) {
      await settleAfterStep(tabId, urlBeforeStep);
    }
  }
}

export async function runMacro(tabId: number, macro: Macro): Promise<void> {
  const run = newRunId();
  log.info("run started", {
    run,
    tabId,
    macroId: macro.id,
    macroName: macro.name,
    mode: macro.script ? "script" : "steps",
  });

  try {
    await focusTabForPlayback(tabId);

    if (macro.script) {
      await runMacroScript(tabId, macro.script);
    } else {
      await runMacroSteps(tabId, macro.steps);
    }
    log.info("run finished", { run, macroName: macro.name });
  } catch (error) {
    log.error("run failed", {
      run,
      macroName: macro.name,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  } finally {
    clearRunId();
  }
}
