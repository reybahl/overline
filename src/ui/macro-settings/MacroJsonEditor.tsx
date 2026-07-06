import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { sendBackgroundMessage } from "@/shared/clients/background-client";
import {
  formatMacroForEdit,
  parseMacroEditJson,
} from "@/shared/macro-edit";
import type { Macro } from "@/shared/types/macro";
import { Button, FieldGroup, TextArea } from "@/ui/components";

import { ShortcutCapture } from "@/ui/macro-settings/ShortcutCapture";

type MacroJsonEditorProps = {
  macro: Macro;
  onSaved: (macros: Macro[]) => void;
  onDirtyChange?: (dirty: boolean) => void;
};

export function MacroJsonEditor({
  macro,
  onSaved,
  onDirtyChange,
}: MacroJsonEditorProps) {
  const [text, setText] = useState(() => formatMacroForEdit(macro));
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  const saveMacro = useCallback(async () => {
    const result = parseMacroEditJson(text, macro);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    const response = await sendBackgroundMessage({
      type: "SAVE_MACRO",
      macro: result.macro,
    });

    if (!response.ok) {
      toast.error(response.error);
      return;
    }

    toast.success("Saved");
    onSaved(response.macros);
    setDirty(false);
  }, [text, macro, onSaved]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey) || event.key !== "s") {
        return;
      }

      event.preventDefault();
      if (dirty) {
        void saveMacro();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [dirty, saveMacro]);

  function updateText(next: string): void {
    setText(next);
    setDirty(true);
  }

  function reset(): void {
    setText(formatMacroForEdit(macro));
    setDirty(false);
  }

  return (
    <div className="ui-macro-json-editor">
      <ShortcutCapture macro={macro} text={text} onTextChange={updateText} />

      <FieldGroup label="Editable fields">
        <TextArea
          className="ui-macro-json-editor__textarea"
          mono
          rows={18}
          spellCheck={false}
          value={text}
          onChange={(event) => {
            updateText(event.target.value);
          }}
        />
      </FieldGroup>

      <div className="ui-inline-actions">
        <Button size="sm" disabled={!dirty} onClick={() => void saveMacro()}>
          Save
        </Button>
        <Button size="sm" variant="ghost" disabled={!dirty} onClick={reset}>
          Reset
        </Button>
      </div>
    </div>
  );
}
