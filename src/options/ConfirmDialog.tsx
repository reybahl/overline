import { useEffect, useRef } from "react";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = "ui-dialog-title";

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

  return (
    <dialog
      ref={dialogRef}
      className="ui-dialog"
      aria-labelledby={titleId}
      onClose={onCancel}
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
    >
      <form
        className="ui-dialog__panel"
        onSubmit={(event) => {
          event.preventDefault();
          onConfirm();
        }}
      >
        <h2 id={titleId} className="ui-dialog__title">
          {title}
        </h2>
        <p className="ui-dialog__message">{message}</p>
        <div className="ui-dialog__actions">
          <button
            type="button"
            className="ui-btn"
            onClick={() => {
              onCancel();
            }}
          >
            {cancelLabel}
          </button>
          <button
            type="submit"
            className={`ui-btn ${destructive ? "ui-btn--destructive" : "ui-btn--primary"}`}
          >
            {confirmLabel}
          </button>
        </div>
      </form>
    </dialog>
  );
}
