import { X } from "lucide-react";

import { LlmSettingsEditor } from "@/options/LlmSettingsEditor";
import { Button, Dialog } from "@/ui/components";

type LlmSettingsDialogProps = {
  open: boolean;
  onClose: () => void;
};

export function LlmSettingsDialog({ open, onClose }: LlmSettingsDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onClose();
        }
      }}
      popupClassName="ui-macro-settings"
      trackId="llm-settings"
    >
      <div className="ui-macro-settings__form">
        <header className="ui-macro-settings__header">
          <h2 className="ui-macro-settings__title">AI settings</h2>
          <Button variant="icon" aria-label="Close AI settings" onClick={onClose}>
            <X className="ui-icon" size={16} strokeWidth={2} aria-hidden />
          </Button>
        </header>

        <div className="ui-macro-settings__body">
          <div className="ui-macro-settings__content">
            <LlmSettingsEditor onSaved={onClose} />
          </div>
        </div>
      </div>
    </Dialog>
  );
}
