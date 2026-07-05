import {
  palettePanelEl,
  statusEl,
} from "@/window/palette/elements";

let paramOnlyMode = false;

export function isParamOnlyMode(): boolean {
  return paramOnlyMode;
}

export function getRunMacroIdFromUrl(): string | null {
  return new URLSearchParams(window.location.search).get("runMacro");
}

export function enableParamOnlyMode(): void {
  paramOnlyMode = true;
  document.documentElement.classList.add("ol-param-only");
  document.querySelector(".ui-shell")?.classList.add("ui-shell--param-only");
  palettePanelEl.hidden = true;
  statusEl.hidden = true;
}
