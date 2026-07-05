import { macroNeedsParams } from "@/shared/macro-signature";
import type { Macro } from "@/shared/types/macro";

type MacroParamsSummaryProps = {
  macro: Macro;
};

export function MacroParamsSummary({ macro }: MacroParamsSummaryProps) {
  if (!macroNeedsParams(macro)) {
    return null;
  }

  return (
    <div className="ui-section">
      <p className="ui-section__title">Params</p>
      <ul className="ui-list--stack">
        {macro.signature!.params.map((param) => (
          <li key={param.name} className="ui-code-item">
            {param.label} ({param.type}) · {`{{${param.name}}}`}
            {param.description ? ` — ${param.description}` : ""}
          </li>
        ))}
      </ul>
    </div>
  );
}
