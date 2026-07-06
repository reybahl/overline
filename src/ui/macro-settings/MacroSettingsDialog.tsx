import { X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/options/ConfirmDialog";
import { sendBackgroundMessage } from "@/shared/clients/background-client";
import type { Macro } from "@/shared/types/macro";
import { Button, Dialog } from "@/ui/components";
import { MacroSettingsBody } from "@/ui/macro-settings/MacroSettingsBody";

type MacroSettingsDialogProps = {
  macro: Macro;
  open: boolean;
  onClose: () => void;
  onSaved: (macros: Macro[]) => void;
};

export function MacroSettingsDialog({
  macro,
  open,
  onClose,
  onSaved,
}: MacroSettingsDialogProps) {
  const [editedMacro, setEditedMacro] = useState(macro);
  const [dirty, setDirty] = useState(false);
  const [deletePending, setDeletePending] = useState(false);

  function handleSaved(macros: Macro[]): void {
    onSaved(macros);
    const updated = macros.find((entry) => entry.id === editedMacro.id);
    if (updated) {
      setEditedMacro(updated);
    }
  }

  function requestClose(): void {
    if (dirty && !window.confirm("Discard unsaved changes?")) {
      return;
    }
    onClose();
  }

  async function confirmDelete(): Promise<void> {
    const response = await sendBackgroundMessage({
      type: "DELETE_MACRO",
      macroId: editedMacro.id,
    });

    setDeletePending(false);

    if (!response.ok) {
      toast.error(response.error);
      return;
    }

    toast.success(`Deleted "${editedMacro.name}"`);
    onSaved(response.macros);
    onClose();
  }

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (nextOpen) {
            return;
          }
          requestClose();
        }}
        popupClassName="ui-macro-settings"
        trackId="macro-settings"
      >
        <div className="ui-macro-settings__form">
          <header className="ui-macro-settings__header">
            <h2 className="ui-macro-settings__title">{editedMacro.name}</h2>
            <Button
              variant="icon"
              aria-label="Close settings"
              onClick={requestClose}
            >
              <X className="ui-icon" size={16} strokeWidth={2} aria-hidden />
            </Button>
          </header>

          <div className="ui-macro-settings__body">
            <div className="ui-macro-settings__content">
              <MacroSettingsBody
                macro={editedMacro}
                onSaved={handleSaved}
                onDirtyChange={setDirty}
                onDelete={() => {
                  setDeletePending(true);
                }}
                onClose={requestClose}
              />
            </div>
          </div>
        </div>
      </Dialog>

      <ConfirmDialog
        open={deletePending}
        title="Delete macro?"
        message={`"${editedMacro.name}" will be permanently removed.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        destructive
        onConfirm={() => {
          void confirmDelete();
        }}
        onCancel={() => {
          setDeletePending(false);
        }}
      />
    </>
  );
}
