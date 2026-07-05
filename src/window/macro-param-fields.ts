import type { MacroParam } from "@/shared/types/macro-signature";

export function appendMacroParamFields(
  container: HTMLElement,
  paramDefs: MacroParam[],
): HTMLInputElement[] {
  const inputs: HTMLInputElement[] = [];

  for (const param of paramDefs) {
    const field = document.createElement("label");
    field.className = "ui-param-prompt__field";

    const label = document.createElement("span");
    label.className = "ui-param-prompt__label";
    label.textContent = param.label;

    const input = document.createElement("input");
    input.className = "ui-param-prompt__input";
    input.name = param.name;
    input.type = "text";
    input.inputMode = param.type === "number" ? "numeric" : "text";
    input.autocomplete = "off";
    input.spellcheck = false;
    if (param.description) {
      input.placeholder = param.description;
    }

    field.append(label, input);
    container.appendChild(field);
    inputs.push(input);
  }

  return inputs;
}

export function readMacroParamValues(
  inputs: HTMLInputElement[],
): Record<string, string> {
  return Object.fromEntries(
    inputs.map((input) => [input.name, input.value.trim()]),
  );
}
