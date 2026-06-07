import type { BackgroundMessage, BackgroundResponse } from "@/shared/types/messages";

function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Popup markup is missing #${id}`);
  }
  return element as T;
}

const recordBtn = requireElement<HTMLButtonElement>("record-btn");
const runBtn = requireElement<HTMLButtonElement>("run-btn");
const statusEl = requireElement<HTMLParagraphElement>("status");
const optionsLink = requireElement<HTMLAnchorElement>("options-link");

function setStatus(message: string, isError = false): void {
  statusEl.textContent = message;
  statusEl.classList.toggle("error", isError);
}

async function sendBackgroundMessage(
  message: BackgroundMessage,
): Promise<BackgroundResponse> {
  return chrome.runtime.sendMessage(message);
}

async function handleAction(
  message: BackgroundMessage,
  successMessage: string,
): Promise<void> {
  recordBtn.toggleAttribute("disabled", true);
  runBtn.toggleAttribute("disabled", true);

  try {
    const response = await sendBackgroundMessage(message);
    if (!response.ok) {
      throw new Error(response.error);
    }
    setStatus(successMessage);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Something went wrong";
    setStatus(errorMessage, true);
  } finally {
    recordBtn.toggleAttribute("disabled", false);
    runBtn.toggleAttribute("disabled", false);
  }
}

recordBtn.addEventListener("click", () => {
  void handleAction({ type: "RECORD_MACRO" }, "Recording started on this tab");
});

runBtn.addEventListener("click", () => {
  void handleAction({ type: "RUN_MACRO" }, "Run macro dispatched");
});

optionsLink.addEventListener("click", (event) => {
  event.preventDefault();
  void chrome.runtime.openOptionsPage();
});
