import type { ContentMessage, ContentResponse } from "@/shared/types/messages";

const OVERLAY_HOST_ID = "patch-overlay-host";
const PANEL_WIDTH = 380;
const PANEL_HEIGHT = 560;
const PANEL_PATH = "src/window/index.html";

declare global {
  interface Window {
    __patchOverlayHostLoaded?: boolean;
  }
}

let overlayHost: HTMLDivElement | null = null;
let keydownHandler: ((event: KeyboardEvent) => void) | null = null;
let previousBodyOverflow = "";

function getPanelUrl(): string {
  return chrome.runtime.getURL(PANEL_PATH);
}

function isOverlayOpen(): boolean {
  return overlayHost !== null;
}

function closeOverlay(): void {
  if (!isOverlayOpen()) {
    return;
  }

  if (keydownHandler) {
    document.removeEventListener("keydown", keydownHandler, true);
    keydownHandler = null;
  }

  overlayHost?.remove();
  overlayHost = null;
  document.body.style.overflow = previousBodyOverflow;
}

function openOverlay(): void {
  if (isOverlayOpen()) {
    return;
  }

  previousBodyOverflow = document.body.style.overflow;
  document.body.style.overflow = "hidden";

  overlayHost = document.createElement("div");
  overlayHost.id = OVERLAY_HOST_ID;
  overlayHost.setAttribute("role", "dialog");
  overlayHost.setAttribute("aria-modal", "true");
  overlayHost.setAttribute("aria-label", "Patch");
  overlayHost.style.cssText = [
    "position:fixed",
    "inset:0",
    "z-index:2147483647",
    "display:flex",
    "align-items:center",
    "justify-content:center",
    "background:rgba(0,0,0,0.35)",
  ].join(";");

  overlayHost.addEventListener("mousedown", (event) => {
    if (event.target === overlayHost) {
      closeOverlay();
    }
  });

  const panel = document.createElement("div");
  panel.style.cssText = [
    `width:${PANEL_WIDTH}px`,
    `height:${PANEL_HEIGHT}px`,
    "border:1px solid #000",
    "background:#fff",
    "flex-shrink:0",
    "overflow:hidden",
  ].join(";");

  const iframe = document.createElement("iframe");
  iframe.src = getPanelUrl();
  iframe.title = "Patch";
  iframe.setAttribute("scrolling", "yes");
  iframe.style.cssText = "width:100%;height:100%;border:0;display:block;";

  panel.appendChild(iframe);
  overlayHost.appendChild(panel);
  document.documentElement.appendChild(overlayHost);

  keydownHandler = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopImmediatePropagation();
      closeOverlay();
    }
  };
  document.addEventListener("keydown", keydownHandler, true);
}

function toggleOverlay(): void {
  if (isOverlayOpen()) {
    closeOverlay();
    return;
  }

  openOverlay();
}

function initializeOverlayHost(): void {
  if (window.__patchOverlayHostLoaded) {
    return;
  }
  window.__patchOverlayHostLoaded = true;

  chrome.runtime.onMessage.addListener(
    (
      message: ContentMessage,
      _sender,
      sendResponse: (response: ContentResponse) => void,
    ) => {
      if (message.type === "CLOSE_PATCH_OVERLAY") {
        closeOverlay();
        sendResponse({ ok: true });
        return false;
      }

      if (message.type !== "TOGGLE_PATCH_OVERLAY") {
        return false;
      }

      try {
        toggleOverlay();
        sendResponse({ ok: true });
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : "Failed to toggle Patch";
        sendResponse({ ok: false, error: errorMessage });
      }

      return false;
    },
  );
}

initializeOverlayHost();
