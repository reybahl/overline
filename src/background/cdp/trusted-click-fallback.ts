import { attachDebugger, detachDebugger } from "@/background/cdp/driver";
import { trustedClick } from "@/background/cdp/input";
import { sendContentMessage } from "@/background/inject";
import { settleAfterStep, waitForUrlChangeAfterClick, STEP_WAIT_FOR_MS } from "@/background/playback/tab-settle";
import { createLogger } from "@/shared/logger";
import {
  type ClickPostcondition,
  clickExecutionMode,
  getClickPostconditions,
  isSafeForCdpRetry,
  learnTrustedClick,
} from "@/shared/trusted-click";
import type { ElementMatch, MacroScript, ScriptClickStep } from "@/shared/types/script";

const log = createLogger("cdp-fallback");

/** Lazy debugger session — attach only when trusted input is required. */
export interface CdpSession {
  tabId: number;
  ready: boolean;
}

/** Skips redundant pre-click waits when the prior click already verified them. */
export interface ClickVerificationSkip {
  navigation: boolean;
  nextMatch: boolean;
}

export const EMPTY_CLICK_SKIP: ClickVerificationSkip = {
  navigation: false,
  nextMatch: false,
};

export function createCdpSession(tabId: number): CdpSession {
  return { tabId, ready: false };
}

export async function detachCdpSession(session: CdpSession): Promise<void> {
  if (!session.ready) {
    return;
  }
  await detachDebugger(session.tabId);
  session.ready = false;
}

async function ensureCdp(session: CdpSession): Promise<boolean> {
  if (session.ready) {
    return true;
  }

  try {
    await attachDebugger(session.tabId);
    session.ready = true;
    log.debug("attached for trusted click", { tabId: session.tabId });
    return true;
  } catch (error) {
    log.warn("CDP unavailable", {
      tabId: session.tabId,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

async function syntheticClick(tabId: number, step: ScriptClickStep): Promise<void> {
  const response = await sendContentMessage(tabId, {
    type: "EXECUTE_SCRIPT",
    steps: [step],
  });
  if (!response.ok) {
    throw new Error(response.error);
  }
}

async function resolveClickPoint(
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

async function trustedClickStep(
  tabId: number,
  step: ScriptClickStep,
  session: CdpSession,
): Promise<void> {
  if (!(await ensureCdp(session))) {
    throw new Error("CDP unavailable for trusted click.");
  }

  const point = await resolveClickPoint(tabId, step.match, step.index ?? 0);
  await trustedClick(tabId, point);
}

async function waitForScriptMatch(
  tabId: number,
  match: ElementMatch,
  timeoutMs = STEP_WAIT_FOR_MS,
): Promise<void> {
  const response = await sendContentMessage(tabId, {
    type: "EXECUTE_SCRIPT",
    steps: [{ type: "waitFor", match, timeoutMs }],
  });
  if (!response.ok) {
    throw new Error(response.error);
  }
}

async function tryWaitForScriptMatch(
  tabId: number,
  match: ElementMatch,
  timeoutMs = STEP_WAIT_FOR_MS,
): Promise<boolean> {
  try {
    await waitForScriptMatch(tabId, match, timeoutMs);
    return true;
  } catch {
    return false;
  }
}

function postconditionKinds(postconditions: ClickPostcondition[]): {
  needsNavigation: boolean;
  needsNextMatch: boolean;
} {
  return {
    needsNavigation: postconditions.some((entry) => entry.kind === "navigation"),
    needsNextMatch: postconditions.some((entry) => entry.kind === "nextMatch"),
  };
}

function verifiedSkipFlags(
  postconditions: ClickPostcondition[],
  verified: ClickVerificationSkip,
): ClickVerificationSkip {
  const { needsNavigation, needsNextMatch } = postconditionKinds(postconditions);
  return {
    navigation: needsNavigation && verified.navigation,
    nextMatch: needsNextMatch && verified.nextMatch,
  };
}

async function checkPostconditions(
  tabId: number,
  postconditions: ClickPostcondition[],
): Promise<ClickVerificationSkip> {
  const { needsNavigation, needsNextMatch } = postconditionKinds(postconditions);
  let navigation = !needsNavigation;
  let nextMatch = !needsNextMatch;

  for (const postcondition of postconditions) {
    if (postcondition.kind === "navigation") {
      navigation = await waitForUrlChangeAfterClick(tabId, postcondition.urlBefore);
      if (!navigation) {
        return { navigation: false, nextMatch: false };
      }
      continue;
    }

    nextMatch = await tryWaitForScriptMatch(tabId, postcondition.match);
    if (!nextMatch) {
      return { navigation, nextMatch: false };
    }
  }

  return { navigation, nextMatch };
}

async function assertPostconditions(
  tabId: number,
  postconditions: ClickPostcondition[],
): Promise<ClickVerificationSkip> {
  const verified = await checkPostconditions(tabId, postconditions);
  const { needsNavigation, needsNextMatch } = postconditionKinds(postconditions);

  if (needsNavigation && !verified.navigation) {
    throw new Error("Navigation did not occur after trusted click.");
  }
  if (needsNextMatch && !verified.nextMatch) {
    throw new Error("Next target did not appear after trusted click.");
  }

  return verifiedSkipFlags(postconditions, verified);
}

export interface ScriptClickContext {
  script: MacroScript;
  stepIndex: number;
  urlBefore: string | undefined;
  session: CdpSession;
}

/**
 * Run a script click: synthetic by default, CDP when step.trustedClick is set
 * or when observable postconditions fail after synthetic input.
 */
export async function executeScriptClick(
  tabId: number,
  step: ScriptClickStep,
  context: ScriptClickContext,
): Promise<ClickVerificationSkip> {
  const { script, stepIndex, urlBefore, session } = context;
  const postconditions = getClickPostconditions(script.steps, stepIndex, urlBefore);
  const useTrusted = clickExecutionMode(step) === "trusted";

  if (useTrusted) {
    await trustedClickStep(tabId, step, session);
  } else {
    await syntheticClick(tabId, step);
  }
  await settleAfterStep(tabId, urlBefore);

  if (useTrusted || postconditions.length === 0) {
    return EMPTY_CLICK_SKIP;
  }

  const verified = await checkPostconditions(tabId, postconditions);
  const { needsNavigation, needsNextMatch } = postconditionKinds(postconditions);
  const allSatisfied =
    (!needsNavigation || verified.navigation) &&
    (!needsNextMatch || verified.nextMatch);

  if (allSatisfied) {
    return verifiedSkipFlags(postconditions, verified);
  }

  if (!isSafeForCdpRetry(step)) {
    log.debug("skipping CDP retry for toggle click", {
      label: step.label,
      step: stepIndex + 1,
    });
    return EMPTY_CLICK_SKIP;
  }

  if (!(await ensureCdp(session))) {
    log.warn("postcondition missed; CDP unavailable", {
      label: step.label,
      step: stepIndex + 1,
    });
    return EMPTY_CLICK_SKIP;
  }

  log.info("retrying click with CDP", { label: step.label, step: stepIndex + 1 });
  learnTrustedClick(step);

  await trustedClickStep(tabId, step, session);
  await settleAfterStep(tabId, urlBefore);

  return assertPostconditions(tabId, postconditions);
}
