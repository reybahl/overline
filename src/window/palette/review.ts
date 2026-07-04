import type { Macro, MacroStep } from "@/shared/types/macro";
import { macroNeedsInputs } from "@/shared/macro-input";
import { formatScriptStep } from "@/shared/script-format";
import {
  reviewPanelEl,
  reviewScriptJsonEl,
  reviewStepsEl,
  reviewSummaryEl,
} from "@/window/palette/elements";
import { paletteState } from "@/window/palette/state";

function formatStep(step: MacroStep, index: number): string {
  const parts = [`${index + 1}. ${step.type}`];
  if (step.selector) parts.push(step.selector);
  if (step.value) parts.push(`"${step.value}"`);
  return parts.join(" · ");
}

export function hideReview(): void {
  paletteState.pendingMacro = null;
  reviewPanelEl.hidden = true;
  reviewSummaryEl.textContent = "";
  reviewStepsEl.replaceChildren();
  reviewScriptJsonEl.hidden = true;
  reviewScriptJsonEl.textContent = "";
}

export function showReview(macro: Macro, reasoning: string[] = []): void {
  paletteState.pendingMacro = macro;
  const scopeSummary = macro.runScope
    ? ` · Runs on: ${macro.runScope.description}`
    : "";
  const scriptSummary = macro.script
    ? ` · ${macro.script.steps.length} compiled step${
        macro.script.steps.length === 1 ? "" : "s"
      }`
    : "";
  const inputSummary = macroNeedsInputs(macro)
    ? ` · ${macro.inputSchema!.inputs.length} runtime input${
        macro.inputSchema!.inputs.length === 1 ? "" : "s"
      }`
    : "";
  reviewSummaryEl.textContent = `"${macro.name}"${scriptSummary}${inputSummary}${scopeSummary}${
    reasoning.length > 0 ? ` · ${reasoning[reasoning.length - 1]}` : ""
  }`;

  reviewStepsEl.replaceChildren();

  if (macro.intent) {
    const intentItem = document.createElement("li");
    intentItem.textContent = `Intent: "${macro.intent}"`;
    reviewStepsEl.appendChild(intentItem);
  }

  if (macroNeedsInputs(macro)) {
    const inputsLabel = document.createElement("li");
    inputsLabel.textContent = "Runtime inputs:";
    reviewStepsEl.appendChild(inputsLabel);

    reviewStepsEl.append(
      ...macro.inputSchema!.inputs.map((input) => {
        const item = document.createElement("li");
        const detail = input.description ? ` — ${input.description}` : "";
        item.textContent = `${input.label} (${input.type}) · {{${input.name}}}${detail}`;
        return item;
      }),
    );
  }

  if (macro.script) {
    const scriptLabel = document.createElement("li");
    scriptLabel.textContent = "Compiled script (runs on play):";
    reviewStepsEl.appendChild(scriptLabel);

    reviewStepsEl.append(
      ...macro.script.steps.map((step, index) => {
        const item = document.createElement("li");
        item.textContent = formatScriptStep(step, index);
        return item;
      }),
    );
  }

  if (macro.script) {
    reviewScriptJsonEl.textContent = JSON.stringify(macro.script, null, 2);
    reviewScriptJsonEl.hidden = false;
  }

  if (macro.steps.length > 0) {
    const demoLabel = document.createElement("li");
    demoLabel.textContent = "Demo path (reference):";
    reviewStepsEl.appendChild(demoLabel);

    reviewStepsEl.append(
      ...macro.steps.map((step, index) => {
        const item = document.createElement("li");
        item.textContent = formatStep(step, index);
        return item;
      }),
    );
  }

  reviewPanelEl.hidden = false;
}

export function getPendingMacro(): Macro | null {
  return paletteState.pendingMacro;
}
