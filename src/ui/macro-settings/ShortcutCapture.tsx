import { useEffect, useState } from "react";
import { toast } from "sonner";

import { sendBackgroundMessage } from "@/shared/clients/background-client";
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

type ShortcutCaptureJsonProps = {
  macro: Macro;
  text: string;
  onTextChange: (text: string) => void;
  variant?: "section" | "inline";
};

type ShortcutCaptureSaveProps = {
  macro: Macro;
  onSaved: (macros: Macro[]) => void;
  variant?: "section" | "inline";
};

export type ShortcutCaptureProps = ShortcutCaptureJsonProps | ShortcutCaptureSaveProps;

function isJsonMode(
  props: ShortcutCaptureProps,
): props is ShortcutCaptureJsonProps {
  return "onTextChange" in props;
}

export function ShortcutCapture(props: ShortcutCaptureProps) {
  const { macro, variant = "section" } = props;
  const [listening, setListening] = useState(false);
  const shortcut = isJsonMode(props)
    ? readShortcutFromText(props.text, macro)
    : macro.shortcut;

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

      void (async () => {
        if (isJsonMode(props)) {
          props.onTextChange(
            patchMacroShortcutInText(props.text, macro, captured),
          );
          toast.message("Shortcut updated — click Save to apply.");
        } else {
          const response = await sendBackgroundMessage({
            type: "SAVE_MACRO",
            macro: {
              ...macro,
              shortcut: captured,
              updatedAt: Date.now(),
            },
          });

          if (!response.ok) {
            toast.error(response.error);
            return;
          }

          toast.success("Shortcut saved");
          props.onSaved(response.macros);
        }

        setListening(false);
      })();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [listening, macro, props]);

  async function clearShortcut(): Promise<void> {
    if (isJsonMode(props)) {
      props.onTextChange(patchMacroShortcutInText(props.text, macro, undefined));
      toast.message("Shortcut cleared — click Save to apply.");
      return;
    }

    const { shortcut: _removed, ...macroWithoutShortcut } = macro;
    const response = await sendBackgroundMessage({
      type: "SAVE_MACRO",
      macro: {
        ...macroWithoutShortcut,
        updatedAt: Date.now(),
      },
    });

    if (!response.ok) {
      toast.error(response.error);
      return;
    }

    toast.success("Shortcut saved");
    props.onSaved(response.macros);
  }

  const controls = (
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
        <Button size="sm" variant="ghost" onClick={() => void clearShortcut()}>
          Clear
        </Button>
      ) : null}
    </div>
  );

  if (variant === "inline") {
    return controls;
  }

  return (
    <div className="ui-section ui-macro-shortcut">
      <p className="ui-section__title">Shortcut</p>
      {controls}
      {isJsonMode(props) ? (
        <p className="ui-text-muted ui-macro-shortcut__hint">
          Captured shortcuts update the JSON below. You can also set{" "}
          <code>shortcut</code> in the editable fields.
        </p>
      ) : null}
    </div>
  );
}
