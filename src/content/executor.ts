import type { MacroStep } from "@/shared/types/macro";

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

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

async function executeStep(step: MacroStep): Promise<void> {
  switch (step.type) {
    case "click": {
      const element = requireElement(requireSelector(step.selector));
      element.click();
      return;
    }
    case "type":
    case "fill": {
      const element = requireElement(requireSelector(step.selector));
      fillElement(element, step.value ?? "");
      return;
    }
    case "confirm": {
      window.confirm(step.value ?? "Continue?");
      return;
    }
    case "wait": {
      const ms = Number.parseInt(step.value ?? "0", 10);
      await wait(Number.isNaN(ms) ? 0 : ms);
      return;
    }
    case "navigate": {
      const target = step.value ?? step.selector;
      if (!target) {
        throw new Error("Navigate step is missing a URL.");
      }
      window.location.href = target;
      return;
    }
    case "scroll": {
      const element = requireElement(requireSelector(step.selector));
      element.scrollIntoView({ block: "center", inline: "nearest" });
      return;
    }
    default: {
      const _exhaustive: never = step.type;
      throw new Error(`Unsupported step type: ${String(_exhaustive)}`);
    }
  }
}

export async function executeSteps(steps: MacroStep[]): Promise<void> {
  for (const step of steps) {
    await executeStep(step);
  }
}
