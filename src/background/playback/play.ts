import { closePatchOverlay } from "@/background/overlay";
import { getTabUrl } from "@/background/capture";
import {
  attachDebugger,
  detachDebugger,
} from "@/background/cdp/driver";
import { trustedClick } from "@/background/cdp/input";
import { sendContentMessage } from "@/background/inject";
import { settleAfterStep, waitForUrlChangeAfterClick, STEP_WAIT_FOR_MS } from "@/background/playback/tab-settle";
import { clearRunId, createLogger, newRunId } from "@/shared/logger";
import type { Macro, MacroStep } from "@/shared/types/macro";
import { clickMatchLikelyNavigates, elementMatchesEqual } from "@/shared/script-match";
import type { ElementMatch, MacroScript, ScriptClickStep, ScriptStep } from "@/shared/types/script";

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

/**
 * Try to take a debugger session so clicks can be dispatched as trusted input.
 * Returns false (instead of throwing) when CDP is unavailable — e.g. the user
 * has DevTools open on the tab — so playback can fall back to synthetic clicks.
 */
async function tryAttachDebugger(tabId: number): Promise<boolean> {
  try {
    await attachDebugger(tabId);
    return true;
  } catch (error) {
    log.warn("CDP unavailable, using synthetic clicks", {
      tabId,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

/** Ask the content script for the viewport center of a click target. */
async function resolveClickPointInTab(
  tabId: number,
  match: ElementMatch,
  index: number,
): Promise<{ x: number; y: number }> {
  const response = await sendContentMessage(tabId, {
    type: "RESOLVE_CLICK_TARGET",
    match,
    index,
  });
  if (!response.ok) {
    throw new Error(response.error);
  }
  if (!response.point) {
    throw new Error("No coordinates returned for click target.");
  }
  return response.point;
}

/**
 * Click a compiled step. Prefers a trusted CDP click (required for clipboard /
 * focus-gated actions); falls back to a synthetic content-script click if CDP is
 * unavailable or the trusted path fails.
 */
async function clickScriptStep(
  tabId: number,
  step: ScriptClickStep,
  cdpReady: boolean,
): Promise<void> {
  if (cdpReady) {
    try {
      const point = await resolveClickPointInTab(tabId, step.match, step.index ?? 0);
      await trustedClick(tabId, point);
      return;
    } catch (error) {
      log.warn("trusted click failed, falling back to synthetic", {
        label: step.label,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const response = await sendContentMessage(tabId, {
    type: "EXECUTE_SCRIPT",
    steps: [step],
  });
  if (!response.ok) {
    throw new Error(response.error);
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
  cdpReady = false,
): Promise<void> {
  let urlBeforeLastClick: string | undefined;

  for (let i = 0; i < script.steps.length; i++) {
    const step = script.steps[i];
    const stepNum = `${i + 1}/${script.steps.length}`;

    if (i > 0 && step.type === "click") {
      const previousStep = script.steps[i - 1];
      if (
        urlBeforeLastClick &&
        previousStep.type === "click" &&
        clickMatchLikelyNavigates(previousStep.match)
      ) {
        await waitForUrlChangeAfterClick(tabId, urlBeforeLastClick);
      }

      const alreadyWaited =
        previousStep.type === "waitFor" &&
        elementMatchesEqual(previousStep.match, step.match);

      if (!alreadyWaited) {
        log.debug("pre-click wait", { step: stepNum, type: step.type, label: step.label });
        await waitForScriptMatchInTab(tabId, step.match);
      }
    }

    const urlBeforeStep =
      step.type === "click" ? await getTabUrl(tabId) : undefined;

    log.info("executing step", { step: stepNum, type: step.type, label: step.label });

    try {
      if (step.type === "click") {
        await clickScriptStep(tabId, step, cdpReady);
      } else {
        const response = await sendContentMessage(tabId, {
          type: "EXECUTE_SCRIPT",
          steps: [step],
        });
        if (!response.ok) {
          throw new Error(response.error);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error("step failed", {
        step: stepNum,
        type: step.type,
        label: step.label,
        error: message,
      });
      throw new Error(message);
    }

    if (scriptStepNeedsSettle(step)) {
      await settleAfterStep(tabId, urlBeforeStep);
      if (urlBeforeStep) {
        urlBeforeLastClick = urlBeforeStep;
      }
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

  let cdpReady = false;
  try {
    await closePatchOverlay(tabId);
    await focusTabForPlayback(tabId);
    cdpReady = await tryAttachDebugger(tabId);

    if (macro.script) {
      await runMacroScript(tabId, macro.script, cdpReady);
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
    if (cdpReady) {
      await detachDebugger(tabId);
    }
    clearRunId();
  }
}
