import "@/ui/index.css";

import { subscribeStorage } from "@/shared/clients/storage";
import { mountLucideIcon } from "@/ui/mount-icon";
import { Braces, Plus, Settings } from "lucide";
import { paletteActions } from "@/window/palette/actions";
import { handleCaptureDom } from "@/window/palette/capture-dom";
import {
  captureBtn,
  cancelRecordBtn,
  confirmSaveBtn,
  discardBtn,
  generateBtn,
  intentInput,
  optionsLink,
  palettePanelEl,
  searchInput,
  statusEl,
} from "@/window/palette/elements";
import {
  getSelectableItemCount,
  handleRunMacro,
  handleRunSelectedMacro,
  refreshMacros,
  renderMacroList,
  scrollSelectedIntoView,
} from "@/window/palette/macros";
import { initMacroSettingsHost, isMacroSettingsOpen } from "@/window/palette/macro-settings-host";
import { isParamPromptOpen } from "@/window/palette/param-prompt";
import { closePalette, startPanelHeightObserver } from "@/window/palette/panel-host";
import {
  handleCancelRecording,
  handleConfirmSave,
  handleCreateMacroFromSearch,
  handleDiscard,
  handleRecordMacro,
  syncPendingRecord,
} from "@/window/palette/recording-flow";
import { paletteState } from "@/window/palette/state";
import { setStatus } from "@/window/palette/ui";

mountLucideIcon(captureBtn, Braces);
mountLucideIcon(optionsLink, Settings);
mountLucideIcon(generateBtn, Plus);

initMacroSettingsHost();

paletteActions.runMacro = (macro) => {
  void handleRunMacro(macro);
};
paletteActions.createMacro = () => {
  void handleCreateMacroFromSearch();
};

searchInput.addEventListener("input", () => {
  paletteState.selectedIndex = 0;
  renderMacroList();
});

searchInput.addEventListener("keydown", (event) => {
  if (isParamPromptOpen() || isMacroSettingsOpen()) {
    return;
  }

  const itemCount = getSelectableItemCount();

  if (event.key === "ArrowDown") {
    if (itemCount === 0) {
      return;
    }
    event.preventDefault();
    paletteState.selectedIndex = Math.min(paletteState.selectedIndex + 1, itemCount - 1);
    renderMacroList();
    scrollSelectedIntoView();
    return;
  }

  if (event.key === "ArrowUp") {
    if (itemCount === 0) {
      return;
    }
    event.preventDefault();
    paletteState.selectedIndex = Math.max(paletteState.selectedIndex - 1, 0);
    renderMacroList();
    scrollSelectedIntoView();
    return;
  }

  if (event.key === "Enter") {
    event.preventDefault();
    void handleRunSelectedMacro();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") {
    return;
  }

  if (isParamPromptOpen() || isMacroSettingsOpen()) {
    return;
  }

  event.preventDefault();
  closePalette();
});

generateBtn.addEventListener("click", () => {
  void handleRecordMacro();
});

intentInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    void handleRecordMacro();
  }
});

captureBtn.addEventListener("click", () => {
  void handleCaptureDom();
});

confirmSaveBtn.addEventListener("click", () => {
  void handleConfirmSave();
});

discardBtn.addEventListener("click", () => {
  handleDiscard();
});

cancelRecordBtn.addEventListener("click", () => {
  void handleCancelRecording();
});

optionsLink.addEventListener("click", () => {
  void chrome.runtime.openOptionsPage();
});

startPanelHeightObserver();

function getRunMacroIdFromUrl(): string | null {
  return new URLSearchParams(window.location.search).get("runMacro");
}

function enableParamOnlyMode(): void {
  document.querySelector(".ui-shell")?.classList.add("ui-shell--param-only");
  palettePanelEl.hidden = true;
  statusEl.hidden = true;
}

const runMacroId = getRunMacroIdFromUrl();
const paramOnlyMode = runMacroId !== null;

if (paramOnlyMode) {
  enableParamOnlyMode();
}

void refreshMacros()
  .then(() => syncPendingRecord())
  .then(async () => {
    if (!runMacroId) {
      searchInput.focus();
      return;
    }

    const macro = paletteState.savedMacros.find((entry) => entry.id === runMacroId);
    if (!macro) {
      closePalette();
      return;
    }

    await handleRunMacro(macro, { closeOnFinish: true });
  })
  .catch((error: unknown) => {
    const message =
      error instanceof Error ? error.message : "Failed to load macros";
    if (paramOnlyMode) {
      closePalette();
      return;
    }
    setStatus(message, true);
  });

subscribeStorage((change) => {
  if (change.macros) {
    void refreshMacros().catch((error: unknown) => {
      const message =
        error instanceof Error ? error.message : "Failed to refresh macros";
      setStatus(message, true);
    });
  }

  if (change.pendingRecord) {
    void syncPendingRecord();
  }
});
