import type { MacroStep } from "@/shared/types/macro";

export function formatMacroStep(step: MacroStep, index: number): string {
  const parts = [`${index + 1}. ${step.type}`];
  if (step.selector) parts.push(step.selector);
  if (step.value) {
    if (step.type === "confirm") {
      parts.push(`confirm: "${step.value}"`);
    } else if (step.type === "waitFor") {
      parts.push(`timeout: ${step.value}ms`);
    } else {
      parts.push(`"${step.value}"`);
    }
  }
  return parts.join(" · ");
}
