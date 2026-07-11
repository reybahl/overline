import { useEffect, useState } from "react";

import type { Macro } from "@/shared/types/macro";
import { MacroSettingsDialog } from "@/ui/macro-settings/MacroSettingsDialog";
import { setPanelModalOpen } from "@/window/palette/panel-host";

type DialogState = {
  open: boolean;
  macro: Macro | null;
};

type MacroSettingsHostProps = {
  onRegisterOpen: (open: (macro: Macro) => void) => void;
};

export function MacroSettingsHost({ onRegisterOpen }: MacroSettingsHostProps) {
  const [state, setState] = useState<DialogState>({ open: false, macro: null });

  useEffect(() => {
    onRegisterOpen((macro) => {
      setState({ open: true, macro });
    });
  }, [onRegisterOpen]);

  useEffect(() => {
    setPanelModalOpen(state.open);
    return () => {
      if (state.open) {
        setPanelModalOpen(false);
      }
    };
  }, [state.open]);

  if (!state.macro) {
    return null;
  }

  return (
    <MacroSettingsDialog
      key={`${state.macro.id}-${state.macro.updatedAt}`}
      macro={state.macro}
      open={state.open}
      surface="modal"
      onClose={() => {
        setState({ open: false, macro: null });
      }}
      onSaved={() => {
        // Storage subscription refreshes the macro list.
      }}
    />
  );
}
