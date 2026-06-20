import type { ElementMatch, ScriptStep } from "@/shared/types/script";

function formatMatch(match: ElementMatch): string {
  const parts: string[] = [];
  if (match.id) parts.push(`#${match.id}`);
  if (match.tag) parts.push(match.tag);
  if (match.ariaLabel) parts.push(`aria="${match.ariaLabel}"`);
  if (match.text) parts.push(`text="${match.text}"`);
  if (match.textContains) parts.push(`text~="${match.textContains}"`);
  if (match.testId) parts.push(`testid="${match.testId}"`);
  if (match.hrefSuffix) parts.push(`href*="${match.hrefSuffix}"`);
  if (match.hrefContains) parts.push(`href~="${match.hrefContains}"`);
  if (match.hrefPattern) parts.push(`href=/ ${match.hrefPattern} /`);
  return parts.join(" ");
}

function formatClickIndex(index: number | undefined): string {
  if (index === undefined || index === 0) {
    return " · first match";
  }
  return ` · match #${index + 1}`;
}

export function formatScriptStep(step: ScriptStep, index: number): string {
  const prefix = step.label ? `${step.label} — ` : "";

  switch (step.type) {
    case "click":
      return `${index + 1}. ${prefix}click · ${formatMatch(step.match)}${formatClickIndex(step.index)}`;
    case "fill":
      return `${index + 1}. ${prefix}fill · ${formatMatch(step.match)} → "${step.value}"`;
    case "wait":
      return `${index + 1}. ${prefix}wait · ${step.ms}ms`;
    case "waitFor":
      return `${index + 1}. ${prefix}waitFor · ${formatMatch(step.match)}${
        step.timeoutMs ? ` · up to ${Math.round(step.timeoutMs / 1000)}s` : ""
      }`;
    default: {
      const _exhaustive: never = step;
      return `${index + 1}. ${String(_exhaustive)}`;
    }
  }
}
