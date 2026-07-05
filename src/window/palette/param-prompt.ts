import type { MacroParamValues } from "@/shared/macro-signature";
import { macroNeedsParams, validateMacroParamValues } from "@/shared/macro-signature";
import type { Macro } from "@/shared/types/macro";
import {
  appendMacroParamFields,
  readMacroParamValues,
} from "@/window/macro-param-fields";
import {
  paramPromptCancelBtn,
  paramPromptDialog,
  paramPromptErrorEl,
  paramPromptFieldsEl,
  paramPromptForm,
  paramPromptTitleEl,
} from "@/window/palette/elements";

export function isParamPromptOpen(): boolean {
  return paramPromptDialog.open;
}

export function promptMacroParams(macro: Macro): Promise<MacroParamValues | null> {
  if (!macroNeedsParams(macro) || !macro.signature) {
    return Promise.resolve({});
  }

  const paramDefs = macro.signature.params;

  return new Promise((resolve) => {
    paramPromptTitleEl.textContent = macro.name;
    paramPromptFieldsEl.replaceChildren();
    paramPromptErrorEl.hidden = true;
    paramPromptErrorEl.textContent = "";

    const inputs = appendMacroParamFields(paramPromptFieldsEl, paramDefs);

    const finish = (values: MacroParamValues | null) => {
      paramPromptDialog.close();
      paramPromptForm.removeEventListener("submit", onSubmit);
      paramPromptCancelBtn.removeEventListener("click", onCancel);
      paramPromptDialog.removeEventListener("cancel", onCancel);
      resolve(values);
    };

    const onCancel = (event: Event) => {
      event.preventDefault();
      finish(null);
    };

    const onSubmit = (event: Event) => {
      event.preventDefault();
      const values = readMacroParamValues(inputs);
      const error = validateMacroParamValues(paramDefs, values);
      if (error) {
        paramPromptErrorEl.textContent = error;
        paramPromptErrorEl.hidden = false;
        const invalid = inputs.find((input) => !input.value.trim());
        (invalid ?? inputs[0])?.focus();
        return;
      }
      finish(values);
    };

    paramPromptForm.addEventListener("submit", onSubmit);
    paramPromptCancelBtn.addEventListener("click", onCancel);
    paramPromptDialog.addEventListener("cancel", onCancel);

    paramPromptDialog.showModal();
    inputs[0]?.focus();
    inputs[0]?.select();
  });
}
