import { useEffect, useState } from "react";

import { sendBackgroundMessage } from "@/shared/clients/background-client";
import type { Macro } from "@/shared/types/macro";
import {
  eventToShortcut,
  formatShortcutForDisplay,
} from "@/shared/shortcut";

type ShortcutEditorProps = {
  macro: Macro;
  onSaved: (macros: Macro[]) => void;
  onError: (message: string | null) => void;
};

export function ShortcutEditor({ macro, onSaved, onError }: ShortcutEditorProps) {
  const [listening, setListening] = useState(false);

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

      const shortcut = eventToShortcut(event);
      if (!shortcut) {
        return;
      }

      void (async () => {
        const response = await sendBackgroundMessage({
          type: "SAVE_MACRO",
          macro: {
            ...macro,
            shortcut,
            updatedAt: Date.now(),
          },
        });

        if (!response.ok) {
          onError(response.error);
          setListening(false);
          return;
        }

        onSaved(response.macros);
        setListening(false);
      })();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [listening, macro, onError, onSaved]);

  async function clearShortcut(): Promise<void> {
    const { shortcut: _removed, ...macroWithoutShortcut } = macro;
    const response = await sendBackgroundMessage({
      type: "SAVE_MACRO",
      macro: {
        ...macroWithoutShortcut,
        updatedAt: Date.now(),
      },
    });

    if (!response.ok) {
      onError(response.error);
      return;
    }

    onSaved(response.macros);
  }

  return (
    <div className="ui-section">
      <p className="ui-section__title">Shortcut</p>
      <div className="ui-inline-actions">
        {macro.shortcut ? (
          <kbd className="ui-kbd">{formatShortcutForDisplay(macro.shortcut)}</kbd>
        ) : (
          <span className="ui-text-muted">None</span>
        )}
        <button
          type="button"
          className="ui-btn ui-btn--sm"
          onClick={() => {
            onError(null);
            setListening(true);
          }}
        >
          {listening ? "Press keys… (Esc to cancel)" : macro.shortcut ? "Change" : "Set shortcut"}
        </button>
        {macro.shortcut ? (
          <button
            type="button"
            className="ui-btn ui-btn--sm ui-btn--ghost"
            onClick={() => {
              void clearShortcut();
            }}
          >
            Clear
          </button>
        ) : null}
      </div>
    </div>
  );
}
