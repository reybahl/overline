import { createLogger } from "@/shared/logger";

const log = createLogger("cdp");

/** DevTools protocol version we speak. */
const PROTOCOL_VERSION = "1.3";

/** Tabs we currently hold a debugger session on, so we never double-attach. */
const attachedTabs = new Set<number>();

/**
 * Raised when we cannot drive the tab over CDP (no permission, DevTools already
 * open on the tab, target not debuggable…). Callers should fall back to the
 * synthetic content-script path rather than failing the run.
 */
export class CdpUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CdpUnavailableError";
  }
}

function target(tabId: number): chrome.debugger.Debuggee {
  return { tabId };
}

/** Attach a debugger session to the tab. No-op if we already hold one. */
export async function attachDebugger(tabId: number): Promise<void> {
  if (attachedTabs.has(tabId)) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    chrome.debugger.attach(target(tabId), PROTOCOL_VERSION, () => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new CdpUnavailableError(error.message ?? "debugger.attach failed"));
        return;
      }
      resolve();
    });
  });

  attachedTabs.add(tabId);
  log.debug("attached", { tabId });
}

/** Detach our debugger session. Safe to call even if not attached. */
export async function detachDebugger(tabId: number): Promise<void> {
  if (!attachedTabs.has(tabId)) {
    return;
  }
  attachedTabs.delete(tabId);

  await new Promise<void>((resolve) => {
    chrome.debugger.detach(target(tabId), () => {
      // Swallow lastError: the session may already be gone (tab closed, etc.).
      void chrome.runtime.lastError;
      resolve();
    });
  });

  log.debug("detached", { tabId });
}

/** Send a CDP command and resolve with its typed result. */
export async function sendCommand<TResult = unknown>(
  tabId: number,
  method: string,
  params?: Record<string, unknown>,
): Promise<TResult> {
  return new Promise<TResult>((resolve, reject) => {
    chrome.debugger.sendCommand(target(tabId), method, params, (result) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(`${method} failed: ${error.message}`));
        return;
      }
      resolve(result as TResult);
    });
  });
}

// Chrome detaches us when the user opens DevTools on the tab, the tab closes, or
// the target crashes. Keep our bookkeeping in sync so a later attach retries.
chrome.debugger.onDetach.addListener((source, reason) => {
  if (typeof source.tabId !== "number") {
    return;
  }
  attachedTabs.delete(source.tabId);
  log.debug("session ended externally", { tabId: source.tabId, reason });
});
