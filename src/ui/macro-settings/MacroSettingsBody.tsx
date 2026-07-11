import type { Macro } from "@/shared/types/macro";

import { MacroJsonEditor } from "@/ui/macro-settings/MacroJsonEditor";
import type { SettingsSurface } from "@/ui/macro-settings/settings-surface";

type MacroSettingsBodyProps = {
  macro: Macro;
  surface: SettingsSurface;
  onSaved: (macros: Macro[]) => void;
  onDirtyChange?: (dirty: boolean) => void;
  onDelete?: () => void;
  onClose?: () => void;
};

export function MacroSettingsBody({
  macro,
  surface,
  onSaved,
  onDirtyChange,
  onDelete,
  onClose,
}: MacroSettingsBodyProps) {
  return (
    <MacroJsonEditor
      key={`${macro.id}-${macro.updatedAt}`}
      macro={macro}
      surface={surface}
      onSaved={onSaved}
      onDirtyChange={onDirtyChange}
      onDelete={onDelete}
      onClose={onClose}
    />
  );
}
