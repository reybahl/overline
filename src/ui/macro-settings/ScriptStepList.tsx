import { formatScriptStepBody } from "@/shared/script-format";
import { SCRIPT_STEP_TYPE_STYLE } from "@/shared/script-step-type-style";
import type { MacroScript } from "@/shared/types/script";

type ScriptStepListProps = {
  script: MacroScript;
  macroId: string;
};

export function ScriptStepList({ script, macroId }: ScriptStepListProps) {
  return (
    <ol className="ui-list--stack">
      {script.steps.map((step, index) => (
        <li key={`${macroId}-script-${index}`} className="ui-code-item ui-code-item--row">
          <span className="ui-code-item__lead">
            {index + 1}.
            <span className="ui-badge" style={SCRIPT_STEP_TYPE_STYLE[step.type]}>
              {step.type}
            </span>
          </span>
          <span className="ui-code-item__body">
            {step.label ? <>{step.label} — </> : null}
            {formatScriptStepBody(step)}
          </span>
        </li>
      ))}
    </ol>
  );
}
