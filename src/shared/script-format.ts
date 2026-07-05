import type { ElementMatch, ScriptStep } from "@/shared/types/script";

function formatMatch(match: ElementMatch): string {
  const parts: string[] = [];
  if (match.id) parts.push(`#${match.id}`);
  if (match.tag) parts.push(match.tag);
  if (match.ariaLabel) parts.push(`aria="${match.ariaLabel}"`);
  if (match.text) parts.push(`text="${match.text}"`);
  if (match.textContains) parts.push(`text~="${match.textContains}"`);
  if (match.testId) parts.push(`testid="${match.testId}"`);
  if (match.pressed !== undefined) parts.push(`pressed=${match.pressed}`);
  if (match.hrefSuffix) parts.push(`href*="${match.hrefSuffix}"`);
  if (match.hrefContains) parts.push(`href~="${match.hrefContains}"`);
  if (match.hrefPattern) parts.push(`href=/ ${match.hrefPattern} /`);
  if (match.hrefFromPathSegment !== undefined) {
    parts.push(`href=path[${match.hrefFromPathSegment}]`);
  }
  return parts.join(" ");
}

function formatClickIndex(index: number | undefined): string {
  if (index === undefined || index === 0) {
    return " · first match";
  }
  return ` · match #${index + 1}`;
}

export function formatScriptStepBody(step: ScriptStep): string {
  switch (step.type) {
    case "click":
      return `${formatMatch(step.match)}${formatClickIndex(step.index)}`;
    case "fill":
      return `${formatMatch(step.match)} → "${step.value}"`;
    case "wait":
      return `${step.ms}ms`;
    case "waitFor":
      return `${formatMatch(step.match)}${
        step.timeoutMs ? ` · up to ${Math.round(step.timeoutMs / 1000)}s` : ""
      }`;
    case "navigate":
      return step.href;
    default: {
      const _exhaustive: never = step;
      return String(_exhaustive);
    }
  }
}

export function formatScriptStep(step: ScriptStep, index: number): string {
  const prefix = step.label ? `${step.label} — ` : "";
  return `${index + 1}. ${prefix}${step.type} · ${formatScriptStepBody(step)}`;
}
