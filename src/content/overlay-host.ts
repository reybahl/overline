import type { ContentMessage, ContentResponse } from "@/shared/types/messages";

const OVERLAY_HOST_ID = "patch-overlay-host";
const OVERLAY_STYLE_ID = "patch-overlay-styles";
const PANEL_WIDTH = 380;
const PANEL_MAX_HEIGHT = 560;
const PANEL_PATH = "src/window/index.html";
const PANEL_RESIZE_MESSAGE = "PATCH_PANEL_RESIZE";

const overlayStyles = `
#${OVERLAY_HOST_ID} {
  position: fixed;
  inset: 0;
  z-index: 2147483647;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgb(15 15 15 / 28%);
}

#${OVERLAY_HOST_ID} .patch-overlay-panel {
  width: ${PANEL_WIDTH}px;
  background: #ffffff;
  border-radius: 12px;
  box-shadow:
    0 24px 48px rgb(15 15 15 / 16%),
    0 2px 8px rgb(15 15 15 / 8%);
  flex-shrink: 0;
  overflow: hidden;
}

#${OVERLAY_HOST_ID} .patch-overlay-frame {
  width: 100%;
  height: 100%;
  border: 0;
  display: block;
  border-radius: 12px;
}

@media (prefers-color-scheme: dark) {
  #${OVERLAY_HOST_ID} {
    background: rgb(0 0 0 / 55%);
  }

  #${OVERLAY_HOST_ID} .patch-overlay-panel {
    background: #202020;
    box-shadow:
      0 24px 48px rgb(0 0 0 / 45%),
      0 0 0 1px rgb(255 255 255 / 8%);
  }
}
`;

declare global {
  interface Window {
    __patchOverlayHostLoaded?: boolean;
  }
}

let overlayHost: HTMLDivElement | null = null;
let panelElement: HTMLDivElement | null = null;
let panelFrame: HTMLIFrameElement | null = null;
let keydownHandler: ((event: KeyboardEvent) => void) | null = null;
let previousBodyOverflow = "";

function ensureOverlayStyles(): void {
  if (document.getElementById(OVERLAY_STYLE_ID)) {
    return;
  }

  const style = document.createElement("style");
  style.id = OVERLAY_STYLE_ID;
  style.textContent = overlayStyles;
  document.documentElement.appendChild(style);
}

function getPanelUrl(): string {
  return chrome.runtime.getURL(PANEL_PATH);
}

function isOverlayOpen(): boolean {
  return overlayHost !== null;
}

function clampPanelHeight(height: number): number {
  const maxHeight = Math.min(
    PANEL_MAX_HEIGHT,
    Math.floor(window.innerHeight * 0.85),
  );
  return Math.min(Math.max(height, 1), maxHeight);
}

function handlePanelResize(event: MessageEvent): void {
  if (event.source !== panelFrame?.contentWindow) {
    return;
  }

  const extensionOrigin = new URL(getPanelUrl()).origin;
  if (event.origin !== extensionOrigin) {
    return;
  }

  if (event.data?.type !== PANEL_RESIZE_MESSAGE) {
    return;
  }

  const height = Number(event.data.height);
  if (!Number.isFinite(height) || !panelElement) {
    return;
  }

  const clamped = clampPanelHeight(height);
  panelElement.style.height = `${clamped}px`;
  panelFrame?.setAttribute("scrolling", height > clamped ? "yes" : "no");
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
  panelElement = null;
  panelFrame = null;
  window.removeEventListener("message", handlePanelResize);
  document.body.style.overflow = previousBodyOverflow;
}

function openOverlay(): void {
  if (isOverlayOpen()) {
    return;
  }

  ensureOverlayStyles();
  previousBodyOverflow = document.body.style.overflow;
  document.body.style.overflow = "hidden";

  overlayHost = document.createElement("div");
  overlayHost.id = OVERLAY_HOST_ID;
  overlayHost.setAttribute("role", "dialog");
  overlayHost.setAttribute("aria-modal", "true");
  overlayHost.setAttribute("aria-label", "Patch");

  overlayHost.addEventListener("mousedown", (event) => {
    if (event.target === overlayHost) {
      closeOverlay();
    }
  });

  const panel = document.createElement("div");
  panel.className = "patch-overlay-panel";

  const iframe = document.createElement("iframe");
  iframe.src = getPanelUrl();
  iframe.title = "Patch";
  iframe.className = "patch-overlay-frame";
  iframe.setAttribute("scrolling", "no");

  panel.appendChild(iframe);
  overlayHost.appendChild(panel);
  document.documentElement.appendChild(overlayHost);

  panelElement = panel;
  panelFrame = iframe;
  window.addEventListener("message", handlePanelResize);

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
