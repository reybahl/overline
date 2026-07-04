import { useEffect } from "react";

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
  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCancel();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onCancel]);

  if (!open) {
    return null;
  }

  const titleId = "ui-dialog-title";

  return (
    <div
      className="ui-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <button
        type="button"
        className="ui-dialog__backdrop"
        aria-label={cancelLabel}
        onClick={onCancel}
      />
      <div className="ui-dialog__panel">
        <h2 id={titleId} className="ui-dialog__title">
          {title}
        </h2>
        <p className="ui-dialog__message">{message}</p>
        <div className="ui-dialog__actions">
          <button type="button" className="ui-btn" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`ui-btn ${destructive ? "ui-btn--destructive" : "ui-btn--primary"}`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
