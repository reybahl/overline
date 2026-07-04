import {
  PANEL_CLOSE_MESSAGE,
  PANEL_RESIZE_MESSAGE,
} from "@/ui/tokens";

export function closePalette(): void {
  if (window.parent === window) {
    return;
  }

  window.parent.postMessage({ type: PANEL_CLOSE_MESSAGE }, "*");
}

function reportPanelHeight(): void {
  if (window.parent === window) {
    return;
  }

  const height = Math.ceil(document.documentElement.offsetHeight);
  window.parent.postMessage(
    { type: PANEL_RESIZE_MESSAGE, height },
    "*",
  );
}

export function startPanelHeightObserver(): void {
  if (window.parent === window) {
    return;
  }

  const scheduleReport = (): void => {
    requestAnimationFrame(reportPanelHeight);
  };

  scheduleReport();
  window.addEventListener("load", scheduleReport);
  new ResizeObserver(scheduleReport).observe(document.documentElement);
}
