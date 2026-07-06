import { StrictMode, useCallback, useRef } from "react";
import { createRoot } from "react-dom/client";

import type { Macro } from "@/shared/types/macro";
import { isAnyDialogOpen } from "@/ui/components/dialog-open";
import { Toaster } from "@/ui/components";
import { MacroSettingsHost } from "@/window/palette/MacroSettingsHost";

let dispatchOpen: ((macro: Macro) => void) | null = null;

export function initMacroSettingsHost(): void {
  const container = document.getElementById("macro-settings-root");
  if (!container) {
    throw new Error("Overline markup is missing #macro-settings-root");
  }

  function HostBridge() {
    const openRef = useRef<((macro: Macro) => void) | null>(null);

    const onRegisterOpen = useCallback((open: (macro: Macro) => void) => {
      openRef.current = open;
      dispatchOpen = (macro) => {
        openRef.current?.(macro);
      };
    }, []);

    return (
      <>
        <MacroSettingsHost onRegisterOpen={onRegisterOpen} />
        <Toaster />
      </>
    );
  }

  createRoot(container).render(
    <StrictMode>
      <div className="ui-root">
        <HostBridge />
      </div>
    </StrictMode>,
  );
}

export function openMacroSettings(macro: Macro): void {
  dispatchOpen?.(macro);
}

export function isMacroSettingsOpen(): boolean {
  return isAnyDialogOpen();
}
