import { formatMacroStep } from "@/shared/macro-step-format";
import { formatScriptStep } from "@/shared/script-format";
import type { Macro } from "@/shared/types/macro";

import { MacroDetailsEditor } from "@/ui/macro-settings/MacroDetailsEditor";
import { RunScopeEditor } from "@/ui/macro-settings/RunScopeEditor";
import { ShortcutEditor } from "@/ui/macro-settings/ShortcutEditor";

type MacroSettingsBodyProps = {
  macro: Macro;
  onSaved: (macros: Macro[]) => void;
  onError: (message: string | null) => void;
  onDelete?: () => void;
};

export function MacroSettingsBody({
  macro,
  onSaved,
  onError,
  onDelete,
}: MacroSettingsBodyProps) {
  return (
    <>
      <MacroDetailsEditor
        key={`${macro.id}-${macro.updatedAt}-details`}
        macro={macro}
        onSaved={onSaved}
        onError={onError}
      />
      <RunScopeEditor
        key={`${macro.id}-${macro.updatedAt}-scope`}
        macro={macro}
        onSaved={onSaved}
        onError={onError}
      />
      <ShortcutEditor macro={macro} onSaved={onSaved} onError={onError} />

      <div className="ui-section">
        {macro.script ? (
          <details className="ui-disclosure">
            <summary className="ui-disclosure__summary">
              {macro.script.steps.length} script step
              {macro.script.steps.length === 1 ? "" : "s"}
            </summary>
            <ol className="ui-list--stack">
              {macro.script.steps.map((step, index) => (
                <li
                  key={`${macro.id}-script-${index}`}
                  className="ui-code-item"
                >
                  {formatScriptStep(step, index)}
                </li>
              ))}
            </ol>
            <details className="ui-disclosure">
              <summary className="ui-disclosure__summary">Raw script JSON</summary>
              <pre className="ui-code">
                {JSON.stringify(macro.script, null, 2)}
              </pre>
            </details>
          </details>
        ) : (
          <p className="ui-text-muted">No compiled script — re-record this macro.</p>
        )}

        <details className="ui-disclosure">
          <summary className="ui-disclosure__summary">
            {macro.steps.length} demo {macro.steps.length === 1 ? "step" : "steps"}{" "}
            (recording reference)
          </summary>
          <ol className="ui-list--stack">
            {macro.steps.map((step, index) => (
              <li key={step.id} className="ui-code-item">
                {formatMacroStep(step, index)}
              </li>
            ))}
          </ol>
        </details>
      </div>

      {onDelete ? (
        <div className="ui-card__footer">
          <button
            type="button"
            className="ui-btn ui-btn--icon ui-btn--danger"
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
          </button>
        </div>
      ) : null}
    </>
  );
}
