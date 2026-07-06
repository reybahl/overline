import type { Macro } from "@/shared/types/macro";

import { MacroJsonEditor } from "@/ui/macro-settings/MacroJsonEditor";

type MacroSettingsBodyProps = {
  macro: Macro;
  onSaved: (macros: Macro[]) => void;
  onDirtyChange?: (dirty: boolean) => void;
  onDelete?: () => void;
  onClose?: () => void;
};

export function MacroSettingsBody({
  macro,
  onSaved,
  onDirtyChange,
  onDelete,
  onClose,
}: MacroSettingsBodyProps) {
  return (
    <MacroJsonEditor
      key={`${macro.id}-${macro.updatedAt}`}
      macro={macro}
      onSaved={onSaved}
      onDirtyChange={onDirtyChange}
      onDelete={onDelete}
      onClose={onClose}
    />
  );
}
