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

  const titleId = "patch-dialog-title";

  return (
    <div
      className="patch-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <button
        type="button"
        className="patch-dialog__backdrop"
        aria-label={cancelLabel}
        onClick={onCancel}
      />
      <div className="patch-dialog__panel">
        <h2 id={titleId} className="patch-dialog__title">
          {title}
        </h2>
        <p className="patch-dialog__message">{message}</p>
        <div className="patch-dialog__actions">
          <button type="button" className="patch-btn" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`patch-btn ${destructive ? "patch-btn--destructive" : "patch-btn--primary"}`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
