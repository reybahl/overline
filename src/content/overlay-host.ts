import type { ContentMessage, ContentResponse } from "@/shared/types/messages";
import {
  PANEL_CLOSE_MESSAGE,
  PANEL_MODAL_CLOSE_MESSAGE,
  PANEL_MODAL_OPEN_MESSAGE,
  PANEL_RESIZE_MESSAGE,
  UI_MODAL_MAX_HEIGHT,
  UI_SHELL_MAX_HEIGHT,
  UI_SHELL_WIDTH,
} from "@/ui/tokens";

const PROMPT_MACRO_PANEL_WIDTH = 360;
const PROMPT_MACRO_PANEL_HEIGHT = 280;

const OVERLAY_HOST_ID = "ui-overlay-host";
const OVERLAY_STYLE_ID = "ui-overlay-styles";
const PALETTE_PANEL_PATH = "src/window/index.html";

/* Color values mirror src/ui/tokens.css */
const overlayStyles = `
#${OVERLAY_HOST_ID} {
  position: fixed;
  inset: 0;
  z-index: 2147483647;
  display: flex;
  align-items: center;
  justify-content: center;
  color-scheme: light dark;
  background: light-dark(rgb(15 15 15 / 28%), rgb(0 0 0 / 55%));
}

#${OVERLAY_HOST_ID} .ui-overlay-panel {
  width: ${UI_SHELL_WIDTH}px;
  background: light-dark(#ffffff, #121212);
  border-radius: 12px;
  box-shadow:
    0 24px 48px rgb(15 15 15 / 16%),
    0 2px 8px rgb(15 15 15 / 8%);
  flex-shrink: 0;
  overflow: hidden;
}

@media (prefers-color-scheme: dark) {
  #${OVERLAY_HOST_ID} .ui-overlay-panel {
    box-shadow:
      0 24px 48px rgb(0 0 0 / 45%),
      0 0 0 1px rgb(255 255 255 / 8%);
  }
}

#${OVERLAY_HOST_ID}.ui-overlay-host--prompt-macro .ui-overlay-panel {
  width: ${PROMPT_MACRO_PANEL_WIDTH}px;
  height: ${PROMPT_MACRO_PANEL_HEIGHT}px;
  background: transparent;
  box-shadow: none;
  border-radius: 0;
  overflow: visible;
}

#${OVERLAY_HOST_ID}.ui-overlay-host--prompt-macro .ui-overlay-frame {
  border-radius: 0;
}

@keyframes ui-overlay-enter {
  from {
    opacity: 0;
  }

  to {
    opacity: 1;
  }
}

@keyframes ui-panel-enter {
  from {
    opacity: 0;
    transform: scale(0.97) translateY(6px);
  }

  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

@media (prefers-reduced-motion: no-preference) {
  #${OVERLAY_HOST_ID} {
    animation: ui-overlay-enter 150ms ease;
  }

  #${OVERLAY_HOST_ID} .ui-overlay-panel {
    animation: ui-panel-enter 180ms cubic-bezier(0.16, 1, 0.3, 1);
    transition: height 120ms ease;
  }
}

#${OVERLAY_HOST_ID} .ui-overlay-frame {
  width: 100%;
  height: 100%;
  border: 0;
  display: block;
  border-radius: 12px;
  color-scheme: light dark;
  background: light-dark(#ffffff, #121212);
}
`;

declare global {
  interface Window {
    __olOverlayHostLoaded?: boolean;
  }
}

let overlayHost: HTMLDivElement | null = null;
let panelElement: HTMLDivElement | null = null;
let panelFrame: HTMLIFrameElement | null = null;
let keydownHandler: ((event: KeyboardEvent) => void) | null = null;
let previousBodyOverflow = "";
let panelModalOpen = false;

function ensureOverlayStyles(): void {
  if (document.getElementById(OVERLAY_STYLE_ID)) {
    return;
  }

  const style = document.createElement("style");
  style.id = OVERLAY_STYLE_ID;
  style.textContent = overlayStyles;
  document.documentElement.appendChild(style);
}

function getPalettePanelUrl(): string {
  return chrome.runtime.getURL(PALETTE_PANEL_PATH);
}

function getPromptMacroPanelUrl(macroId: string): string {
  const url = new URL(chrome.runtime.getURL(PALETTE_PANEL_PATH));
  url.searchParams.set("promptMacro", macroId);
  return url.toString();
}

function isOverlayOpen(): boolean {
  return overlayHost !== null;
}

function clampPanelHeight(height: number): number {
  const maxHeight = Math.min(
    UI_SHELL_MAX_HEIGHT,
    Math.floor(window.innerHeight * 0.85),
  );
  return Math.min(Math.max(height, 1), maxHeight);
}

function clampModalPanelHeight(): number {
  return Math.min(UI_MODAL_MAX_HEIGHT, Math.floor(window.innerHeight * 0.85));
}

function setPanelModalMode(open: boolean): void {
  panelModalOpen = open;
  overlayHost?.classList.toggle("ui-overlay-host--modal", open);

  if (!panelElement || !open) {
    return;
  }

  const height = clampModalPanelHeight();
  panelElement.style.height = `${height}px`;
  panelFrame?.setAttribute("scrolling", "no");
}

function handlePanelMessage(event: MessageEvent): void {
  if (event.source !== panelFrame?.contentWindow) {
    return;
  }

  const extensionOrigin = new URL(getPalettePanelUrl()).origin;
  if (event.origin !== extensionOrigin) {
    return;
  }

  if (event.data?.type === PANEL_CLOSE_MESSAGE) {
    closeOverlay();
    return;
  }

  if (event.data?.type === PANEL_MODAL_OPEN_MESSAGE) {
    setPanelModalMode(true);
    return;
  }

  if (event.data?.type === PANEL_MODAL_CLOSE_MESSAGE) {
    setPanelModalMode(false);
    return;
  }

  if (event.data?.type !== PANEL_RESIZE_MESSAGE) {
    return;
  }

  if (
    panelModalOpen ||
    overlayHost?.classList.contains("ui-overlay-host--prompt-macro")
  ) {
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
  panelModalOpen = false;
  window.removeEventListener("message", handlePanelMessage);
  document.body.style.overflow = previousBodyOverflow;
}

function mountOverlay(options: {
  iframeSrc: string;
  ariaLabel: string;
  iframeTitle: string;
  promptMacro?: boolean;
  replaceExisting?: boolean;
}): void {
  if (isOverlayOpen()) {
    if (!options.replaceExisting) {
      return;
    }
    closeOverlay();
  }

  ensureOverlayStyles();
  previousBodyOverflow = document.body.style.overflow;
  document.body.style.overflow = "hidden";

  overlayHost = document.createElement("div");
  overlayHost.id = OVERLAY_HOST_ID;
  if (options.promptMacro) {
    overlayHost.classList.add("ui-overlay-host--prompt-macro");
  }
  overlayHost.setAttribute("role", "dialog");
  overlayHost.setAttribute("aria-modal", "true");
  overlayHost.setAttribute("aria-label", options.ariaLabel);

  overlayHost.addEventListener("mousedown", (event) => {
    if (event.target === overlayHost) {
      closeOverlay();
    }
  });

  const panel = document.createElement("div");
  panel.className = "ui-overlay-panel";

  const iframe = document.createElement("iframe");
  iframe.src = options.iframeSrc;
  iframe.title = options.iframeTitle;
  iframe.className = "ui-overlay-frame";
  iframe.setAttribute("scrolling", "no");

  panel.appendChild(iframe);
  overlayHost.appendChild(panel);
  document.documentElement.appendChild(overlayHost);

  panelElement = panel;
  panelFrame = iframe;
  window.addEventListener("message", handlePanelMessage);

  keydownHandler = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopImmediatePropagation();
      closeOverlay();
    }
  };
  document.addEventListener("keydown", keydownHandler, true);
}

function openOverlay(): void {
  mountOverlay({
    iframeSrc: getPalettePanelUrl(),
    ariaLabel: "Overline",
    iframeTitle: "Overline",
  });
}

function openOverlayForMacro(macroId: string): void {
  mountOverlay({
    iframeSrc: getPromptMacroPanelUrl(macroId),
    ariaLabel: "Run macro",
    iframeTitle: "Run macro",
    promptMacro: true,
    replaceExisting: true,
  });
}

function toggleOverlay(): void {
  if (isOverlayOpen()) {
    closeOverlay();
    return;
  }

  openOverlay();
}

function initializeOverlayHost(): void {
  if (window.__olOverlayHostLoaded) {
    return;
  }
  window.__olOverlayHostLoaded = true;

  chrome.runtime.onMessage.addListener(
    (
      message: ContentMessage,
      _sender,
      sendResponse: (response: ContentResponse) => void,
    ) => {
      if (message.type === "CLOSE_OVERLAY") {
        closeOverlay();
        sendResponse({ ok: true });
        return false;
      }

      if (message.type === "OPEN_OVERLAY_RUN_MACRO") {
        try {
          openOverlayForMacro(message.macroId);
          sendResponse({ ok: true });
        } catch (error: unknown) {
          const errorMessage =
            error instanceof Error ? error.message : "Failed to open Overline";
          sendResponse({ ok: false, error: errorMessage });
        }
        return false;
      }

      if (message.type !== "TOGGLE_OVERLAY") {
        return false;
      }

      try {
        toggleOverlay();
        sendResponse({ ok: true });
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : "Failed to toggle Overline";
        sendResponse({ ok: false, error: errorMessage });
      }

      return false;
    },
  );
}

initializeOverlayHost();
