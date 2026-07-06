import { useEffect, useState } from "react";
import { toast } from "sonner";

import {
  patchMacroShortcutInText,
  readShortcutFromText,
} from "@/shared/macro-edit";
import {
  eventToShortcut,
  formatShortcutForDisplay,
} from "@/shared/shortcut";
import type { Macro } from "@/shared/types/macro";
import { Button } from "@/ui/components";

type ShortcutCaptureProps = {
  macro: Macro;
  text: string;
  onTextChange: (text: string) => void;
};

export function ShortcutCapture({
  macro,
  text,
  onTextChange,
}: ShortcutCaptureProps) {
  const [listening, setListening] = useState(false);
  const shortcut = readShortcutFromText(text, macro);

  useEffect(() => {
    if (!listening) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();

      if (event.key === "Escape") {
        setListening(false);
        return;
      }

      const captured = eventToShortcut(event);
      if (!captured) {
        return;
      }

      onTextChange(patchMacroShortcutInText(text, macro, captured));
      setListening(false);
      toast.message("Shortcut updated in JSON — click Save to apply.");
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [listening, macro, onTextChange, text]);

  return (
    <div className="ui-section ui-macro-shortcut">
      <p className="ui-section__title">Shortcut</p>
      <div className="ui-inline-actions">
        {shortcut ? (
          <kbd className="ui-kbd">{formatShortcutForDisplay(shortcut)}</kbd>
        ) : (
          <span className="ui-text-muted">None</span>
        )}
        <Button
          size="sm"
          onClick={() => {
            setListening(true);
          }}
        >
          {listening
            ? "Press keys… (Esc to cancel)"
            : shortcut
              ? "Change"
              : "Set shortcut"}
        </Button>
        {shortcut ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              onTextChange(patchMacroShortcutInText(text, macro, undefined));
              toast.message("Shortcut cleared in JSON — click Save to apply.");
            }}
          >
            Clear
          </Button>
        ) : null}
      </div>
      <p className="ui-text-muted ui-macro-shortcut__hint">
        Captured shortcuts update the JSON below. You can also set{" "}
        <code>shortcut</code> in the editable fields.
      </p>
    </div>
  );
}
