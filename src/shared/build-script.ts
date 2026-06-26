import type { MacroStep } from "@/shared/types/macro";
import {
  MacroScriptSchema,
  type ElementMatch,
  type MacroScript,
  type ScriptStep,
} from "@/shared/types/script";

/**
 * Build a deterministic, replayable {@link MacroScript} directly from a recorded
 * demo.
 *
 * Each interactive step already carries `recordedMatch` — a robust match derived
 * from the live element at the instant it was clicked/filled (see
 * `deriveElementMatch`). Because we know exactly what was interacted with, the
 * script is assembled mechanically rather than re-inferred by an LLM from a
 * post-hoc DOM snapshot (which never contains ephemeral elements like open menu
 * items). The playback runner already inserts a pre-click wait for each match,
 * so no explicit `waitFor` steps are needed here.
 */
function parseAttr(selector: string, attr: string): string | undefined {
  return selector.match(new RegExp(`\\[${attr}="([^"]+)"\\]`))?.[1];
}

/** Fallback when a step has no live match (older recordings / unresolved). */
function matchFromSelector(selector: string | undefined): ElementMatch | undefined {
  if (!selector) {
    return undefined;
  }

  if (selector.startsWith("#")) {
    return { id: selector.slice(1) };
  }

  const testId = parseAttr(selector, "data-testid");
  if (testId) {
    return { testId };
  }

  const ariaLabel = parseAttr(selector, "aria-label");
  if (ariaLabel) {
    return { ariaLabel };
  }

  const href = parseAttr(selector, "href");
  if (href) {
    return { tag: "a", hrefSuffix: href };
  }

  return undefined;
}

function clickLabel(match: ElementMatch): string | undefined {
  return match.text ?? match.ariaLabel ?? match.id ?? match.testId;
}

function toScriptStep(step: MacroStep): ScriptStep | null {
  const match = step.recordedMatch ?? matchFromSelector(step.selector);

  switch (step.type) {
    case "click": {
      if (!match) {
        return null;
      }
      const label = clickLabel(match);
      return { type: "click", match, ...(label ? { label } : {}) };
    }
    case "type":
    case "fill": {
      if (!match) {
        return null;
      }
      return { type: "fill", match, value: step.value ?? "" };
    }
    case "wait": {
      const ms = Number.parseInt(step.value ?? "", 10);
      return { type: "wait", ms: Number.isFinite(ms) && ms > 0 ? ms : 0 };
    }
    default:
      // navigate/scroll/confirm/waitFor have no deterministic script equivalent.
      return null;
  }
}

export function buildScriptFromDemo(steps: MacroStep[]): MacroScript {
  const scriptSteps = steps
    .map(toScriptStep)
    .filter((step): step is ScriptStep => step !== null);

  return MacroScriptSchema.parse({ version: 1, steps: scriptSteps });
}
