import { createElement, type IconNode } from "lucide";

export const LUCIDE_ICON_ATTRS = {
  class: "ui-icon",
  width: 16,
  height: 16,
  "stroke-width": 2,
  "aria-hidden": "true",
} as const;

export function createLucideSVGElement(icon: IconNode): SVGElement {
  return createElement(icon, { ...LUCIDE_ICON_ATTRS });
}

export function mountLucideIcon(parent: HTMLElement, icon: IconNode): void {
  parent.appendChild(createLucideSVGElement(icon));
}
