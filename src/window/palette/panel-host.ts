import {
  PANEL_CLOSE_MESSAGE,
  PANEL_MODAL_CLOSE_MESSAGE,
  PANEL_MODAL_OPEN_MESSAGE,
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

/** Expand the host overlay so an in-iframe modal is not clipped to palette height. */
export function setPanelModalOpen(open: boolean): void {
  if (window.parent === window) {
    return;
  }

  if (open) {
    window.parent.postMessage({ type: PANEL_MODAL_OPEN_MESSAGE }, "*");
    return;
  }

  window.parent.postMessage({ type: PANEL_MODAL_CLOSE_MESSAGE }, "*");
  reportPanelHeight();
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
