import { createElement, type IconNode } from "lucide";

const ICON_ATTRS = {
  class: "patch-icon",
  width: 16,
  height: 16,
  "stroke-width": 2,
  "aria-hidden": "true",
} as const;

export function mountLucideIcon(parent: HTMLElement, icon: IconNode): void {
  parent.appendChild(createElement(icon, { ...ICON_ATTRS }));
}
