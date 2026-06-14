import type { ElementMatch, MacroScript, ScriptStep } from "@/shared/types/script";

const ELEMENT_NOT_FOUND =
  "Couldn't find element — try re-recording this macro.";
const INTERACTIVE_SELECTOR = "a, button, input, select, textarea";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function isHidden(el: Element): boolean {
  if (!(el instanceof HTMLElement)) {
    return true;
  }

  if (el.hidden || el.getAttribute("aria-hidden") === "true") {
    return true;
  }

  const style = window.getComputedStyle(el);
  if (
    style.display === "none" ||
    style.visibility === "hidden" ||
    Number.parseFloat(style.opacity) === 0
  ) {
    return true;
  }

  const rect = el.getBoundingClientRect();
  return rect.width === 0 && rect.height === 0;
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
  if (!(el instanceof HTMLElement) || isHidden(el)) {
    return false;
  }

  if (match.id && el.id !== match.id) {
    return false;
  }

  if (match.tag && el.tagName.toLowerCase() !== match.tag) {
    return false;
  }

  if (match.ariaLabel) {
    const ariaLabel = el.getAttribute("aria-label")?.trim() ?? "";
    if (ariaLabel !== match.ariaLabel) {
      return false;
    }
  }

  if (match.text && !matchesText(el, match.text)) {
    return false;
  }

  if (match.textContains && !getVisibleText(el).includes(match.textContains)) {
    return false;
  }

  if (match.testId && getTestId(el) !== match.testId) {
    return false;
  }

  const href = getHref(el);
  const resolvedHref = getResolvedHref(el);

  if (match.hrefSuffix && !href.endsWith(match.hrefSuffix)) {
    return false;
  }

  if (match.hrefContains && !href.includes(match.hrefContains)) {
    return false;
  }

  if (
    match.hrefPattern &&
    !matchesHrefPattern(href, resolvedHref, match.hrefPattern)
  ) {
    return false;
  }

  const hasCriteria =
    match.id ||
    match.tag ||
    match.ariaLabel ||
    match.text ||
    match.textContains ||
    match.hrefSuffix ||
    match.hrefContains ||
    match.hrefPattern ||
    match.testId;

  return Boolean(hasCriteria);
}

function findMatchingElements(match: ElementMatch): HTMLElement[] {
  if (match.id) {
    const byId = document.getElementById(match.id);
    if (byId instanceof HTMLElement && matchesElement(byId, match)) {
      return [byId];
    }
    return [];
  }

  const candidates = document.querySelectorAll(INTERACTIVE_SELECTOR);
  const matches: HTMLElement[] = [];

  for (const candidate of candidates) {
    if (matchesElement(candidate, match)) {
      matches.push(candidate as HTMLElement);
    }
  }

  return matches;
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
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (findMatchingElements(match).length > 0) {
      return;
    }
    await delay(100);
  }

  throw new Error(ELEMENT_NOT_FOUND);
}

async function executeScriptStep(step: ScriptStep): Promise<void> {
  switch (step.type) {
    case "click": {
      requireElement(step.match, step.index ?? 0).click();
      return;
    }
    case "fill": {
      fillElement(requireElement(step.match), step.value);
      return;
    }
    case "wait": {
      await delay(step.ms);
      return;
    }
    case "waitFor": {
      await waitForMatch(step.match, step.timeoutMs ?? 5000);
      return;
    }
    default: {
      const _exhaustive: never = step;
      throw new Error(`Unsupported script step: ${String(_exhaustive)}`);
    }
  }
}

export async function executeScript(script: MacroScript): Promise<void> {
  for (const step of script.steps) {
    await executeScriptStep(step);
  }
}

export async function waitForScriptMatch(
  match: ElementMatch,
  timeoutMs: number,
): Promise<void> {
  await waitForMatch(match, timeoutMs);
}
