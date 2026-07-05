import { useEffect, useRef, useState } from "react";

import { ConfirmDialog } from "@/options/ConfirmDialog";
import { sendBackgroundMessage } from "@/shared/clients/background-client";
import type { Macro } from "@/shared/types/macro";
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
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [editedMacro, setEditedMacro] = useState(macro);
  const [deletePending, setDeletePending] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }

    if (open && !dialog.open) {
      dialog.showModal();
      return;
    }

    if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  function handleSaved(macros: Macro[]): void {
    onSaved(macros);
    const updated = macros.find((entry) => entry.id === editedMacro.id);
    if (updated) {
      setEditedMacro(updated);
    }
  }

  async function confirmDelete(): Promise<void> {
    const response = await sendBackgroundMessage({
      type: "DELETE_MACRO",
      macroId: editedMacro.id,
    });

    setDeletePending(false);

    if (!response.ok) {
      setError(response.error);
      return;
    }

    onSaved(response.macros);
    onClose();
  }

  return (
    <>
      <dialog
        ref={dialogRef}
        className="ui-macro-settings"
        onClose={onClose}
        onCancel={(event) => {
          event.preventDefault();
          onClose();
        }}
      >
        <form method="dialog" className="ui-macro-settings__form">
          <header className="ui-macro-settings__header">
            <h2 className="ui-macro-settings__title">{editedMacro.name}</h2>
            <button
              type="button"
              className="ui-btn ui-btn--icon"
              aria-label="Close settings"
              onClick={onClose}
            >
              <svg
                className="ui-icon"
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M4 4l8 8M12 4l-8 8"
                  stroke="currentColor"
                  strokeWidth="1.25"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </header>

          {error ? <p className="ui-alert ui-alert--error">{error}</p> : null}

          <div className="ui-macro-settings__body">
            <div className="ui-macro-settings__content">
              <MacroSettingsBody
                macro={editedMacro}
                onSaved={handleSaved}
                onError={setError}
                onDelete={() => {
                  setDeletePending(true);
                }}
              />
            </div>
          </div>
        </form>
      </dialog>

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
