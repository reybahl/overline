import {
  actionButtons,
  cancelRecordBtn,
  confirmSaveBtn,
  discardBtn,
  macroListEl,
  searchInput,
  statusEl,
} from "@/window/palette/elements";

export function setStatus(message: string, isError = false): void {
  statusEl.textContent = message;
  statusEl.classList.toggle("ui-status--error", isError);
}

export function setBusy(disabled: boolean): void {
  for (const button of actionButtons) {
    button.toggleAttribute("disabled", disabled);
  }
  searchInput.toggleAttribute("disabled", disabled);
  confirmSaveBtn.toggleAttribute("disabled", disabled);
  discardBtn.toggleAttribute("disabled", disabled);

  for (const button of macroListEl.querySelectorAll("button")) {
    button.toggleAttribute("disabled", disabled);
  }
}

export function setRecordingUi(isRecording: boolean): void {
  cancelRecordBtn.hidden = !isRecording;
}
