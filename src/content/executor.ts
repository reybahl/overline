import { deriveElementMatch } from "@/content/derive-element-match";
import type { MacroStep } from "@/shared/types/macro";
import type { ElementMatch } from "@/shared/types/script";

const ELEMENT_NOT_FOUND =
  "Couldn't find element — try re-recording this macro.";

function requireSelector(selector: string | undefined): string {
  if (!selector) {
    throw new Error(ELEMENT_NOT_FOUND);
  }
  return selector;
}

function requireElement(selector: string): HTMLElement {
  const element = document.querySelector(selector);
  if (!(element instanceof HTMLElement)) {
    throw new Error(ELEMENT_NOT_FOUND);
  }
  return element;
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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

async function waitForSelector(selector: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const element = document.querySelector(selector);
    if (element instanceof HTMLElement) {
      return;
    }
    await delay(100);
  }

  throw new Error(ELEMENT_NOT_FOUND);
}

async function executeStep(step: MacroStep): Promise<ElementMatch | null> {
  switch (step.type) {
    case "click": {
      const element = requireElement(requireSelector(step.selector));
      const match = deriveElementMatch(element);
      element.click();
      return match;
    }
    case "type":
    case "fill": {
      const element = requireElement(requireSelector(step.selector));
      const match = deriveElementMatch(element);
      fillElement(element, step.value ?? "");
      return match;
    }
    case "scroll": {
      const element = requireElement(requireSelector(step.selector));
      const match = deriveElementMatch(element);
      element.scrollIntoView({ block: "center", inline: "nearest" });
      return match;
    }
    case "confirm": {
      window.confirm(step.value ?? "Continue?");
      return null;
    }
    case "wait": {
      const ms = Number.parseInt(step.value ?? "0", 10);
      await delay(Number.isNaN(ms) ? 0 : ms);
      return null;
    }
    case "waitFor": {
      const timeout = Number.parseInt(step.value ?? "5000", 10);
      await waitForSelector(
        requireSelector(step.selector),
        Number.isNaN(timeout) ? 5000 : timeout,
      );
      return null;
    }
    case "navigate": {
      const target = step.value ?? step.selector;
      if (!target) {
        throw new Error("Navigate step is missing a URL.");
      }
      window.location.href = target;
      return null;
    }
    default: {
      const _exhaustive: never = step.type;
      throw new Error(`Unsupported step type: ${String(_exhaustive)}`);
    }
  }
}

export async function executeSteps(
  steps: MacroStep[],
): Promise<(ElementMatch | null)[]> {
  const matches: (ElementMatch | null)[] = [];
  for (const step of steps) {
    matches.push(await executeStep(step));
  }
  return matches;
}
