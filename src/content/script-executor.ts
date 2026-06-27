import { INTERACTIVE_SELECTOR } from "@/shared/interactive-selector";
import type { ElementMatch, MacroScript, ScriptStep } from "@/shared/types/script";
import { getAccessibleName } from "@/content/accessible-name";
import { getVisibleText } from "@/content/element-text";
import { isVisible } from "@/content/visibility";
import { normalizeElementMatch } from "@/shared/script-match";
import { createLogger } from "@/shared/logger";
import type { ContentPoint } from "@/shared/types/messages";
import {
  DEFAULT_SCRIPT_WAIT_FOR_MS,
  MATCH_POLL_INTERVAL_MS,
  MATCH_STABLE_POLLS,
  SCROLL_SETTLE_MS,
} from "@/shared/timing";

const log = createLogger("script");

const ELEMENT_NOT_FOUND =
  "Couldn't find element — try re-recording this macro.";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function isHidden(el: Element): boolean {
  return !isVisible(el);
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

function pathSegmentAt(index: number): string | undefined {
  return window.location.pathname.split("/").filter(Boolean)[index];
}

function linkPathname(href: string, resolvedHref: string): string | undefined {
  try {
    return new URL(resolvedHref || href, window.location.href).pathname;
  } catch {
    if (href.startsWith("/")) {
      return href.split("?")[0]?.split("#")[0];
    }
    return undefined;
  }
}

function matchesHrefFromPathSegment(
  href: string,
  resolvedHref: string,
  segmentIndex: number,
): boolean {
  const segment = pathSegmentAt(segmentIndex);
  if (!segment) {
    return false;
  }

  const linkPath = linkPathname(href, resolvedHref);
  if (!linkPath) {
    return false;
  }

  const expected = `/${segment}`;
  return linkPath === expected || linkPath === `${expected}/`;
}

function matchesHrefPattern(href: string, resolvedHref: string, pattern: string): boolean {
  try {
    const regex = new RegExp(pattern);
    if (regex.test(href) || regex.test(resolvedHref)) {
      return true;
    }

    const pathnameAndSearch = (() => {
      try {
        const url = new URL(resolvedHref || href, window.location.href);
        return url.pathname + url.search;
      } catch {
        return href;
      }
    })();

    if (regex.test(pathnameAndSearch)) {
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

  return getAccessibleName(el) === expected;
}

function matchesAccessibleLabel(el: Element, expected: string): boolean {
  if (getAccessibleName(el) === expected) {
    return true;
  }

  return matchesText(el, expected);
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

  if (criteria.ariaLabel && !matchesAccessibleLabel(el, criteria.ariaLabel)) {
    return false;
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
    criteria.hrefFromPathSegment !== undefined &&
    !matchesHrefFromPathSegment(href, resolvedHref, criteria.hrefFromPathSegment)
  ) {
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
    criteria.hrefFromPathSegment !== undefined ||
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

  return matches.filter(isVisible);
}

function requireElement(match: ElementMatch, index = 0): HTMLElement {
  const matches = findMatchingElements(match);
  if (matches.length <= index) {
    throw new Error(ELEMENT_NOT_FOUND);
  }
  return matches[index];
}

/**
 * Resolve a click target to its viewport center so the background can dispatch a
 * trusted CDP click there. Scrolls the element into view first, then measures.
 */
export async function resolveClickPoint(
  match: ElementMatch,
  index = 0,
): Promise<ContentPoint> {
  const element = requireElement(normalizeElementMatch(match), index);
  element.scrollIntoView({ block: "center", inline: "center" });
  await delay(SCROLL_SETTLE_MS);

  const rect = element.getBoundingClientRect();
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
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

  if (findMatchingElements(match).length > 0) {
    log.debug("waitFor matched", { ms: 0, matchCount: findMatchingElements(match).length });
    return;
  }

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

async function executeScriptStep(step: ScriptStep): Promise<void> {
  switch (step.type) {
    case "click": {
      requireElement(normalizeElementMatch(step.match), step.index ?? 0).click();
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
        normalizeElementMatch(step.match),
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
    try {
      await executeScriptStep(step);
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
