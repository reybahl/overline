export function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Overline markup is missing #${id}`);
  }
  return element as T;
}

export const searchInput = requireElement<HTMLInputElement>("search-input");
export const intentInput = requireElement<HTMLInputElement>("intent-input");
export const macroListEl = requireElement<HTMLUListElement>("macro-list");
export const macroEmptyEl = requireElement<HTMLParagraphElement>("macro-empty");
export const palettePanelEl = requireElement<HTMLElement>("palette-panel");
export const captureBtn = requireElement<HTMLButtonElement>("capture-btn");
export const generateBtn = requireElement<HTMLButtonElement>("generate-btn");
export const statusEl = requireElement<HTMLParagraphElement>("status");
export const captureOutputEl = requireElement<HTMLPreElement>("capture-output");
export const reviewPanelEl = requireElement<HTMLElement>("review-panel");
export const reviewSummaryEl = requireElement<HTMLParagraphElement>("review-summary");
export const reviewStepsEl = requireElement<HTMLOListElement>("review-steps");
export const reviewScriptJsonEl = requireElement<HTMLPreElement>("review-script-json");
export const confirmSaveBtn = requireElement<HTMLButtonElement>("confirm-save-btn");
export const discardBtn = requireElement<HTMLButtonElement>("discard-btn");
export const cancelRecordBtn = requireElement<HTMLButtonElement>("cancel-record-btn");
export const optionsLink = requireElement<HTMLButtonElement>("options-link");

export const actionButtons = [generateBtn, captureBtn];
