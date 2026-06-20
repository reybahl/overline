import type { DomElement } from "@/content/dom-capture";
import type { MacroStep } from "@/shared/types/macro";
import type { ElementMatch, MacroScript, ScriptStep } from "@/shared/types/script";

const TAGS = new Set(["a", "button", "input", "select", "textarea"]);

function parseTestId(selector: string): string | undefined {
  const match = selector.match(/\[data-testid="([^"]+)"\]/);
  return match?.[1];
}

function parseStableId(selector: string): string | undefined {
  if (!selector.startsWith("#")) {
    return undefined;
  }
  return selector.slice(1);
}

function domElementMatchesMatch(el: DomElement, match: ElementMatch): boolean {
  if (match.id) {
    const id = parseStableId(el.selector);
    if (id !== match.id) {
      return false;
    }
  }

  if (match.tag && el.tag !== match.tag) {
    return false;
  }

  if (match.ariaLabel && el.ariaLabel !== match.ariaLabel) {
    return false;
  }

  if (match.text && el.text !== match.text) {
    return false;
  }

  if (match.textContains && !el.text.includes(match.textContains)) {
    return false;
  }

  if (match.testId && parseTestId(el.selector) !== match.testId) {
    return false;
  }

  return Boolean(
    match.id ||
      match.tag ||
      match.ariaLabel ||
      match.text ||
      match.textContains ||
      match.testId,
  );
}

function countDomMatches(elements: DomElement[], match: ElementMatch): number {
  return elements.filter((el) => domElementMatchesMatch(el, match)).length;
}

function matchesEqual(a: ElementMatch, b: ElementMatch): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function deriveMatchFromElement(el: DomElement): ElementMatch {
  const tag = TAGS.has(el.tag) ? (el.tag as ElementMatch["tag"]) : undefined;
  const match: ElementMatch = {};

  if (tag) {
    match.tag = tag;
  }

  if (el.idStable) {
    const id = parseStableId(el.selector);
    if (id) {
      match.id = id;
      return match;
    }
  }

  const testId = parseTestId(el.selector);
  if (testId) {
    match.testId = testId;
    return match;
  }

  if (el.ariaLabel) {
    match.ariaLabel = el.ariaLabel;
    return match;
  }

  if (el.text) {
    match.text = el.text;
  }

  return match;
}

export function sanitizeMatch(
  elements: DomElement[],
  match: ElementMatch,
): ElementMatch {
  if (countDomMatches(elements, match) > 0) {
    return match;
  }

  if (match.ariaLabel) {
    const textFix: ElementMatch = { ...match };
    delete textFix.ariaLabel;
    textFix.text = match.ariaLabel;
    if (countDomMatches(elements, textFix) > 0) {
      return textFix;
    }

    const candidate = elements.find(
      (el) =>
        el.text === match.ariaLabel && (!match.tag || el.tag === match.tag),
    );
    if (candidate) {
      return deriveMatchFromElement(candidate);
    }

    const withoutAria: ElementMatch = { ...match };
    delete withoutAria.ariaLabel;
    if (countDomMatches(elements, withoutAria) > 0) {
      return withoutAria;
    }
  }

  return match;
}

export function buildDemoElementHints(
  demoSteps: MacroStep[],
  elements: DomElement[],
): unknown[] {
  return demoSteps.map((step) => {
    const el = elements.find((entry) => entry.selector === step.selector);
    return {
      demoSelector: step.selector,
      demoType: step.type,
      resolvedElement: el
        ? {
            tag: el.tag,
            role: el.role,
            text: el.text || undefined,
            ariaLabel: el.ariaLabel || undefined,
            controlKind: el.controlKind,
            idStable: el.idStable,
            hasPopup: el.hasPopup,
            expanded: el.expanded,
          }
        : null,
    };
  });
}

export function sanitizeCompiledScript(
  script: MacroScript,
  elements: DomElement[],
  demoSteps: MacroStep[],
): MacroScript {
  let demoClickIndex = 0;

  const steps = script.steps.map((step, index) => {
    if (step.type !== "click" && step.type !== "waitFor") {
      return step;
    }

    let match = sanitizeMatch(elements, step.match);

    if (step.type === "click" && demoClickIndex < demoSteps.length) {
      const demo = demoSteps[demoClickIndex];
      demoClickIndex += 1;
      if (
        countDomMatches(elements, match) === 0 &&
        demo.type === "click" &&
        demo.selector
      ) {
        const demoEl = elements.find((el) => el.selector === demo.selector);
        if (demoEl) {
          match = deriveMatchFromElement(demoEl);
        }
      }
    }

    if (step.type === "waitFor" && index > 0) {
      const previous = script.steps[index - 1];
      if (previous.type === "click" && matchesEqual(previous.match, match)) {
        const nextClick = script.steps
          .slice(index + 1)
          .find(
            (entry): entry is Extract<ScriptStep, { type: "click" }> =>
              entry.type === "click",
          );
        if (nextClick) {
          match = sanitizeMatch(elements, nextClick.match);
        }
      }
    }

    return { ...step, match };
  });

  return { ...script, steps };
}
