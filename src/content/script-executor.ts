import type { ElementMatch, MacroScript, ScriptStep } from "@/shared/types/script";
import {
  isVisible,
  performCopyAction,
  pickBestCopyCandidate,
  scoreCopyCandidate,
} from "@/content/clipboard";
import {
  isCopyIntentLabel,
  normalizeElementMatch,
} from "@/shared/script-match";
import { createLogger } from "@/shared/logger";
import {
  DEFAULT_SCRIPT_WAIT_FOR_MS,
  MATCH_POLL_INTERVAL_MS,
  MATCH_STABLE_POLLS,
} from "@/shared/timing";

const log = createLogger("script");

const ELEMENT_NOT_FOUND =
  "Couldn't find element — try re-recording this macro.";
const INTERACTIVE_SELECTOR =
  "a, button, input, select, textarea, clipboard-copy";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function isHidden(el: Element): boolean {
  return !isVisible(el);
}

function getVisibleText(el: Element): string {
  const text = (el as HTMLElement).innerText ?? el.textContent ?? "";
  return text.trim().replace(/\s+/g, " ");
}

function getHref(el: Element): string {
  if (!(el instanceof HTMLAnchorElement)) {
    return "";
  }

  return el.getAttribute("href")?.trim() ?? "";
}

function getResolvedHref(el: Element): string {
  if (!(el instanceof HTMLAnchorElement)) {
    return "";
  }

  return el.href;
}

function getTestId(el: Element): string {
  return el.getAttribute("data-testid")?.trim() ?? "";
}

function matchesHrefPattern(href: string, resolvedHref: string, pattern: string): boolean {
  try {
    const regex = new RegExp(pattern);
    if (regex.test(href) || regex.test(resolvedHref)) {
      return true;
    }

    const pathname = (() => {
      try {
        return new URL(resolvedHref || href, window.location.href).pathname;
      } catch {
        return href;
      }
    })();

    return regex.test(pathname);
  } catch {
    return false;
  }
}

function matchesText(el: Element, expected: string): boolean {
  const visible = getVisibleText(el);
  if (visible === expected) {
    return true;
  }

  if (visible.startsWith(`${expected} `) || visible.startsWith(`${expected}\n`)) {
    return true;
  }

  const ariaLabel = el.getAttribute("aria-label")?.trim() ?? "";
  return ariaLabel === expected;
}

function matchesElement(el: Element, match: ElementMatch): boolean {
  const criteria = normalizeElementMatch(match);

  if (!(el instanceof HTMLElement) || isHidden(el)) {
    return false;
  }

  if (criteria.id && el.id !== criteria.id) {
    return false;
  }

  if (criteria.tag && el.tagName.toLowerCase() !== criteria.tag) {
    return false;
  }

  if (criteria.ariaLabel) {
    const ariaLabel = el.getAttribute("aria-label")?.trim() ?? "";
    if (ariaLabel !== criteria.ariaLabel) {
      return false;
    }
  }

  if (criteria.text && !matchesText(el, criteria.text)) {
    return false;
  }

  if (criteria.textContains && !getVisibleText(el).includes(criteria.textContains)) {
    return false;
  }

  if (criteria.testId && getTestId(el) !== criteria.testId) {
    return false;
  }

  const href = getHref(el);
  const resolvedHref = getResolvedHref(el);

  if (criteria.hrefSuffix && !href.endsWith(criteria.hrefSuffix)) {
    return false;
  }

  if (criteria.hrefContains && !href.includes(criteria.hrefContains)) {
    return false;
  }

  if (
    criteria.hrefPattern &&
    !matchesHrefPattern(href, resolvedHref, criteria.hrefPattern)
  ) {
    return false;
  }

  const hasCriteria =
    criteria.id ||
    criteria.tag ||
    criteria.ariaLabel ||
    criteria.text ||
    criteria.textContains ||
    criteria.hrefSuffix ||
    criteria.hrefContains ||
    criteria.hrefPattern ||
    criteria.testId;

  return Boolean(hasCriteria);
}

function findMatchingElements(match: ElementMatch): HTMLElement[] {
  const criteria = normalizeElementMatch(match);

  if (criteria.id) {
    const byId = document.getElementById(criteria.id);
    if (byId instanceof HTMLElement && matchesElement(byId, criteria)) {
      return [byId];
    }
    return [];
  }

  const candidates = document.querySelectorAll(INTERACTIVE_SELECTOR);
  const matches: HTMLElement[] = [];

  for (const candidate of candidates) {
    if (matchesElement(candidate, criteria)) {
      matches.push(candidate as HTMLElement);
    }
  }

  if (criteria.tag === "clipboard-copy" || criteria.ariaLabel?.match(/\bcopy\b/i)) {
    const best = pickBestCopyCandidate(matches);
    return best ? [best] : matches.filter(isVisible);
  }

  return matches.filter(isVisible);
}

function requireElement(match: ElementMatch, index = 0): HTMLElement {
  const matches = findMatchingElements(match);
  if (matches.length <= index) {
    throw new Error(ELEMENT_NOT_FOUND);
  }
  return matches[index];
}

function fillElement(element: HTMLElement, value: string): void {
  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement
  ) {
    element.value = value;
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    return;
  }

  throw new Error(ELEMENT_NOT_FOUND);
}

async function waitForMatch(match: ElementMatch, timeoutMs: number): Promise<void> {
  const started = Date.now();
  const deadline = started + timeoutMs;
  let stablePolls = 0;

  while (Date.now() < deadline) {
    if (findMatchingElements(match).length > 0) {
      stablePolls += 1;
      if (stablePolls >= MATCH_STABLE_POLLS) {
        log.debug("waitFor matched", { ms: Date.now() - started, matchCount: findMatchingElements(match).length });
        return;
      }
    } else {
      stablePolls = 0;
    }
    await delay(MATCH_POLL_INTERVAL_MS);
  }

  log.warn("waitFor timed out", { ms: timeoutMs, match });
  throw new Error(ELEMENT_NOT_FOUND);
}

function deriveRuntimeCopyMatch(): ElementMatch | null {
  const ghCliCopy = document.querySelector(
    'clipboard-copy[for="clone-with-gh-cli"]',
  );
  if (ghCliCopy instanceof HTMLElement && isVisible(ghCliCopy)) {
    const ariaLabel = ghCliCopy.getAttribute("aria-label")?.trim();
    return ariaLabel
      ? { tag: "clipboard-copy", ariaLabel }
      : { tag: "clipboard-copy", text: "Copy" };
  }

  const candidates = document.querySelectorAll(
    "clipboard-copy, [data-copy], button[aria-label], [title]",
  );
  const copyControls: HTMLElement[] = [];

  for (const candidate of candidates) {
    if (!(candidate instanceof HTMLElement) || !isVisible(candidate)) {
      continue;
    }

    const ariaLabel = candidate.getAttribute("aria-label")?.trim() ?? "";
    const title = candidate.getAttribute("title")?.trim() ?? "";
    const label = ariaLabel || title;

    if (!/\b(copy|clipboard)\b/i.test(`${label} ${getVisibleText(candidate)}`)) {
      continue;
    }

    copyControls.push(candidate);
  }

  const best = pickBestCopyCandidate(copyControls);
  if (!best) {
    return null;
  }

  const tag = best.tagName.toLowerCase();
  const ariaLabel = best.getAttribute("aria-label")?.trim() ?? "";
  if (tag === "clipboard-copy") {
    return ariaLabel
      ? { tag: "clipboard-copy", ariaLabel }
      : { tag: "clipboard-copy", text: getVisibleText(best) || "Copy" };
  }

  return ariaLabel
    ? { tag: "button", ariaLabel }
    : { tag: "button", text: best.getAttribute("title")?.trim() ?? "Copy" };
}

function looksLikeCloneInputMatch(match: ElementMatch): boolean {
  const normalized = normalizeElementMatch(match);
  return (
    normalized.tag === "input" ||
    normalized.id?.includes("clone") === true ||
    normalized.id?.includes("gh-cli") === true
  );
}

function resolveStepMatch(step: ScriptStep, nextStep?: ScriptStep): ElementMatch {
  if (step.type !== "click" && step.type !== "waitFor") {
    throw new Error("resolveStepMatch called for non-interactive step");
  }

  const match = normalizeElementMatch(step.match);
  const copyLabel =
    step.label ?? (nextStep?.type === "click" ? nextStep.label : undefined);
  const shouldPreferCopyButton =
    isCopyIntentLabel(copyLabel) || step.type === "waitFor";

  if (shouldPreferCopyButton && looksLikeCloneInputMatch(match)) {
    const runtimeCopy = deriveRuntimeCopyMatch();
    if (runtimeCopy) {
      return runtimeCopy;
    }
  }

  return match;
}

function shouldUseCopyAction(step: ScriptStep, match: ElementMatch): boolean {
  if (step.type !== "click") {
    return false;
  }

  return (
    isCopyIntentLabel(step.label) ||
    match.tag === "clipboard-copy" ||
    looksLikeCloneInputMatch(match)
  );
}

async function executeScriptStep(
  step: ScriptStep,
  nextStep?: ScriptStep,
): Promise<void> {
  switch (step.type) {
    case "click": {
      const match = resolveStepMatch(step, nextStep);
      const element = requireElement(match, step.index ?? 0);
      log.info("click step", {
        label: step.label,
        tag: element.tagName.toLowerCase(),
        ariaLabel: element.getAttribute("aria-label"),
        forAttr: element.getAttribute("for"),
        score: scoreCopyCandidate(element),
      });

      if (shouldUseCopyAction(step, match)) {
        await performCopyAction(element);
        return;
      }

      element.click();
      return;
    }
    case "fill": {
      fillElement(requireElement(normalizeElementMatch(step.match)), step.value);
      return;
    }
    case "wait": {
      await delay(step.ms);
      return;
    }
    case "waitFor": {
      await waitForMatch(
        resolveStepMatch(step, nextStep),
        step.timeoutMs ?? DEFAULT_SCRIPT_WAIT_FOR_MS,
      );
      return;
    }
    default: {
      const _exhaustive: never = step;
      throw new Error(`Unsupported script step: ${String(_exhaustive)}`);
    }
  }
}

export async function executeScript(script: MacroScript): Promise<void> {
  for (let i = 0; i < script.steps.length; i++) {
    const step = script.steps[i];
    const nextStep = script.steps[i + 1];
    try {
      await executeScriptStep(step, nextStep);
    } catch (error) {
      log.error("step failed", {
        step: `${i + 1}/${script.steps.length}`,
        type: step.type,
        label: step.label,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}

export async function waitForScriptMatch(
  match: ElementMatch,
  timeoutMs: number,
): Promise<void> {
  await waitForMatch(match, timeoutMs);
}
