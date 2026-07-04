import type { Macro, MacroStep } from "@/shared/types/macro";
import { macroNeedsParams } from "@/shared/macro-signature";
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
  const paramSummary = macroNeedsParams(macro)
    ? ` · ${macro.signature!.params.length} param${
        macro.signature!.params.length === 1 ? "" : "s"
      }`
    : "";
  reviewSummaryEl.textContent = `"${macro.name}"${scriptSummary}${paramSummary}${scopeSummary}${
    reasoning.length > 0 ? ` · ${reasoning[reasoning.length - 1]}` : ""
  }`;

  reviewStepsEl.replaceChildren();

  if (macro.intent) {
    const intentItem = document.createElement("li");
    intentItem.textContent = `Intent: "${macro.intent}"`;
    reviewStepsEl.appendChild(intentItem);
  }

  if (macroNeedsParams(macro)) {
    const paramsLabel = document.createElement("li");
    paramsLabel.textContent = "Signature (runtime params):";
    reviewStepsEl.appendChild(paramsLabel);

    reviewStepsEl.append(
      ...macro.signature!.params.map((param) => {
        const item = document.createElement("li");
        const detail = param.description ? ` — ${param.description}` : "";
        item.textContent = `${param.label} (${param.type}) · {{${param.name}}}${detail}`;
        return item;
      }),
    );
  }

  if (macro.script) {
    const scriptLabel = document.createElement("li");
    scriptLabel.textContent = "Compiled script (template body):";
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
