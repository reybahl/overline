import type { Macro } from "@/shared/types/macro";
import { Button } from "@/ui/components";

import { MacroJsonEditor } from "@/ui/macro-settings/MacroJsonEditor";

type MacroSettingsBodyProps = {
  macro: Macro;
  onSaved: (macros: Macro[]) => void;
  onDirtyChange?: (dirty: boolean) => void;
  onDelete?: () => void;
};

export function MacroSettingsBody({
  macro,
  onSaved,
  onDirtyChange,
  onDelete,
}: MacroSettingsBodyProps) {
  return (
    <>
      <MacroJsonEditor
        key={`${macro.id}-${macro.updatedAt}`}
        macro={macro}
        onSaved={onSaved}
        onDirtyChange={onDirtyChange}
      />

      {onDelete ? (
        <div className="ui-card__footer">
          <Button
            variant="icon"
            className="ui-btn--danger"
            aria-label={`Delete ${macro.name}`}
            onClick={onDelete}
          >
            <svg
              className="ui-icon"
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M2.5 4.5h11M6 4.5V3.25A.75.75 0 0 1 6.75 2.5h2.5a.75.75 0 0 1 .75.75V4.5M12.5 4.5v8.25a.75.75 0 0 1-.75.75H4.25a.75.75 0 0 1-.75-.75V4.5"
                stroke="currentColor"
                strokeWidth="1.25"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M6.75 7.25v4M9.25 7.25v4"
                stroke="currentColor"
                strokeWidth="1.25"
                strokeLinecap="round"
              />
            </svg>
          </Button>
        </div>
      ) : null}
    </>
  );
}
