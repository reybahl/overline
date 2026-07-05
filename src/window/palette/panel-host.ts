import {
  PANEL_CLOSE_MESSAGE,
  PANEL_RESIZE_MESSAGE,
} from "@/ui/tokens";
import { paramPromptDialog } from "@/window/palette/elements";
import { isParamOnlyMode } from "@/window/palette/param-only";

export function closePalette(): void {
  if (window.parent === window) {
    return;
  }

  window.parent.postMessage({ type: PANEL_CLOSE_MESSAGE }, "*");
}

function measurePanelHeight(): number {
  if (isParamOnlyMode() && paramPromptDialog.open) {
    return Math.ceil(paramPromptDialog.getBoundingClientRect().height);
  }

  return Math.ceil(document.documentElement.offsetHeight);
}

function reportPanelHeight(): void {
  if (window.parent === window) {
    return;
  }

  window.parent.postMessage(
    { type: PANEL_RESIZE_MESSAGE, height: measurePanelHeight() },
    "*",
  );
}

export function schedulePanelHeightReport(): void {
  requestAnimationFrame(reportPanelHeight);
}

export function startPanelHeightObserver(): void {
  if (window.parent === window) {
    return;
  }

  scheduleReport();
  window.addEventListener("load", scheduleReport);
  new ResizeObserver(scheduleReport).observe(document.documentElement);

  if (isParamOnlyMode()) {
    new ResizeObserver(scheduleReport).observe(paramPromptDialog);
  }
}

function scheduleReport(): void {
  schedulePanelHeightReport();
}
