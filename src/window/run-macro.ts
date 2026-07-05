import "@/ui/index.css";
import "./run-macro.css";

import { macroNeedsParams, validateMacroParamValues } from "@/shared/macro-signature";
import { sendBackgroundMessage } from "@/shared/clients/background-client";
import { macroMatchesUrl } from "@/shared/macro-match";
import {
  getActiveTab,
  getRestrictedPageMessage,
  isInjectableUrl,
} from "@/shared/tab";
import {
  appendMacroParamFields,
  readMacroParamValues,
} from "@/window/macro-param-fields";
import { closePalette, startPanelHeightObserver } from "@/window/palette/panel-host";

const form = document.getElementById("run-macro-form") as HTMLFormElement;
const titleEl = document.getElementById("run-macro-title") as HTMLHeadingElement;
const fieldsEl = document.getElementById("run-macro-fields") as HTMLDivElement;
const errorEl = document.getElementById("run-macro-error") as HTMLParagraphElement;
const cancelBtn = document.getElementById("run-macro-cancel") as HTMLButtonElement;

function getMacroIdFromUrl(): string | null {
  return new URLSearchParams(window.location.search).get("macroId");
}

async function runMacro(macroId: string, params: Record<string, string>): Promise<void> {
  const tab = await getActiveTab();
  const tabId = tab.id;
  const url = tab.url;

  if (tabId === undefined) {
    throw new Error("No active tab found.");
  }
  if (!url || !isInjectableUrl(url)) {
    throw new Error(getRestrictedPageMessage(url));
  }

  const response = await sendBackgroundMessage({
    type: "EXECUTE_MACRO",
    tabId,
    macroId,
    ...(Object.keys(params).length > 0 ? { params } : {}),
  });

  if (!response.ok) {
    throw new Error(response.error ?? "Failed to run macro.");
  }
}

async function initialize(): Promise<void> {
  const macroId = getMacroIdFromUrl();
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
    await runMacro(macro.id, {});
    closePalette();
    return;
  }

  const paramDefs = macro.signature.params;
  const inputs = appendMacroParamFields(fieldsEl, paramDefs);

  cancelBtn.addEventListener("click", () => {
    closePalette();
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void (async () => {
      const values = readMacroParamValues(inputs);
      const validationError = validateMacroParamValues(paramDefs, values);
      if (validationError) {
        errorEl.textContent = validationError;
        errorEl.hidden = false;
        const invalid = inputs.find((input) => !input.value.trim());
        (invalid ?? inputs[0])?.focus();
        return;
      }

      errorEl.hidden = true;
      try {
        await runMacro(macro.id, values);
        closePalette();
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to run macro";
        errorEl.textContent = message;
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
