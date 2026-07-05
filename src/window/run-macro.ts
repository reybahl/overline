import "@/ui/index.css";

import { macroNeedsParams, validateMacroParamValues } from "@/shared/macro-signature";
import type { MacroParam } from "@/shared/types/macro-signature";
import { sendBackgroundMessage } from "@/shared/clients/background-client";
import { macroMatchesUrl } from "@/shared/macro-match";
import { getActiveTab, isInjectableUrl } from "@/shared/tab";
import { executeMacroById } from "@/window/palette/macros";
import { closePalette, startPanelHeightObserver } from "@/window/palette/panel-host";

const form = document.getElementById("run-macro-form") as HTMLFormElement;
const titleEl = document.getElementById("run-macro-title") as HTMLHeadingElement;
const fieldsEl = document.getElementById("run-macro-fields") as HTMLDivElement;
const errorEl = document.getElementById("run-macro-error") as HTMLParagraphElement;
const cancelBtn = document.getElementById("run-macro-cancel") as HTMLButtonElement;

function appendParamFields(
  container: HTMLElement,
  paramDefs: MacroParam[],
): HTMLInputElement[] {
  const inputs: HTMLInputElement[] = [];

  for (const param of paramDefs) {
    const field = document.createElement("label");
    field.className = "ui-param-prompt__field";

    const label = document.createElement("span");
    label.className = "ui-param-prompt__label";
    label.textContent = param.label;

    const input = document.createElement("input");
    input.className = "ui-param-prompt__input";
    input.name = param.name;
    input.type = "text";
    input.inputMode = param.type === "number" ? "numeric" : "text";
    input.autocomplete = "off";
    input.spellcheck = false;
    if (param.description) {
      input.placeholder = param.description;
    }

    field.append(label, input);
    container.appendChild(field);
    inputs.push(input);
  }

  return inputs;
}

async function initialize(): Promise<void> {
  const macroId = new URLSearchParams(window.location.search).get("macroId");
  if (!macroId) {
    closePalette();
    return;
  }

  const macrosResponse = await sendBackgroundMessage({ type: "GET_MACROS" });
  if (!macrosResponse.ok) {
    throw new Error(macrosResponse.error);
  }

  const macro = macrosResponse.macros.find((entry) => entry.id === macroId);
  if (!macro) {
    closePalette();
    return;
  }

  const tab = await getActiveTab();
  const url = tab.url;
  if (!url || !isInjectableUrl(url) || !macroMatchesUrl(macro, url)) {
    closePalette();
    return;
  }

  titleEl.textContent = macro.name;

  if (!macroNeedsParams(macro) || !macro.signature) {
    await executeMacroById(macro.id);
    closePalette();
    return;
  }

  const paramDefs = macro.signature.params;
  const inputs = appendParamFields(fieldsEl, paramDefs);

  cancelBtn.addEventListener("click", () => {
    closePalette();
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void (async () => {
      const values = Object.fromEntries(
        inputs.map((input) => [input.name, input.value.trim()]),
      );
      const validationError = validateMacroParamValues(paramDefs, values);
      if (validationError) {
        errorEl.textContent = validationError;
        errorEl.hidden = false;
        (inputs.find((input) => !input.value.trim()) ?? inputs[0])?.focus();
        return;
      }

      errorEl.hidden = true;
      try {
        await executeMacroById(macro.id, values);
        closePalette();
      } catch (error) {
        errorEl.textContent =
          error instanceof Error ? error.message : "Failed to run macro";
        errorEl.hidden = false;
      }
    })();
  });

  inputs[0]?.focus();
  inputs[0]?.select();
}

startPanelHeightObserver();

void initialize().catch(() => {
  closePalette();
});
