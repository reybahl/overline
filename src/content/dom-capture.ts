import { getAccessibleName } from "@/content/accessible-name";
import { isVisible } from "@/content/visibility";
import { INTERACTIVE_SELECTOR } from "@/shared/interactive-selector";
import { isStableId } from "@/shared/stable-id";

const INTERACTIVE_TAGS = new Set([
  "button",
  "a",
  "input",
  "select",
  "textarea",
]);

const INTERACTIVE_ROLES = new Set([
  "button",
  "tab",
  "menuitem",
  "option",
  "menuitemradio",
  "menuitemcheckbox",
  "switch",
  "checkbox",
  "radio",
  "link",
  "textbox",
  "combobox",
]);

const MAX_ELEMENTS = 80;

export type DomElement = {
  tag: string;
  role: string;
  text: string;
  selector: string;
  ariaLabel: string;
  placeholder: string;
  idStable: boolean;
  controlKind?: string;
  expanded?: boolean;
  hasPopup?: string;
  /** aria-selected — true once a tab/option is active. */
  selected?: boolean;
  /** aria-pressed — true for an engaged toggle button. */
  pressed?: boolean;
  /** checked state for checkboxes/radios/aria-checked. */
  checked?: boolean;
};

function escapeAttr(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function isHidden(el: Element): boolean {
  if (el instanceof HTMLInputElement && el.type === "hidden") {
    return true;
  }

  return !isVisible(el);
}

function getText(el: Element): string {
  const text = (el as HTMLElement).innerText ?? el.textContent ?? "";
  return text.trim().replace(/\s+/g, " ").slice(0, 200);
}

function getFieldValue(el: Element): string {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    return el.value?.trim() ?? "";
  }
  return "";
}

function getPlaceholder(el: Element): string {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    return el.placeholder?.trim() ?? "";
  }
  return "";
}

function hasMeaningfulLabel(
  text: string,
  ariaLabel: string,
  placeholder: string,
  fieldValue = "",
): boolean {
  return (
    text.length > 0 ||
    ariaLabel.length > 0 ||
    placeholder.length > 0 ||
    fieldValue.length > 0
  );
}

function getStableHref(anchor: HTMLAnchorElement): string | null {
  const href = anchor.getAttribute("href")?.trim();
  if (!href || href === "#" || href.startsWith("javascript:")) {
    return null;
  }
  return href;
}

function getRole(el: Element): string {
  const explicit = el.getAttribute("role")?.trim().toLowerCase();
  if (explicit) {
    return explicit;
  }

  const tag = el.tagName.toLowerCase();
  if (tag === "button") {
    return "button";
  }
  if (tag === "a") {
    return "link";
  }
  if (tag === "select") {
    return "combobox";
  }
  if (tag === "textarea") {
    return "textbox";
  }
  if (tag === "input") {
    const type = ((el as HTMLInputElement).type || "text").toLowerCase();
    if (type === "button" || type === "submit" || type === "reset") {
      return "button";
    }
    if (type === "checkbox") {
      return "checkbox";
    }
    if (type === "radio") {
      return "radio";
    }
    return "textbox";
  }

  return tag;
}

function inferControlKind(el: Element, role: string): string | undefined {
  const hasPopup = el.getAttribute("aria-haspopup");
  const expanded = el.getAttribute("aria-expanded");

  if (role === "tab") {
    return "nav-tab";
  }
  if (role === "menuitem" || role === "menuitemradio" || role === "menuitemcheckbox") {
    return "menu-item";
  }
  if (hasPopup === "true" || hasPopup === "menu" || hasPopup === "listbox") {
    return "dropdown-trigger";
  }
  if (expanded === "true" || expanded === "false") {
    return "disclosure";
  }
  if (role === "link") {
    return "link";
  }
  if (role === "button") {
    return "action-button";
  }
  return undefined;
}

function isInteractiveElement(el: Element, role: string): boolean {
  const tag = el.tagName.toLowerCase();
  if (INTERACTIVE_TAGS.has(tag)) {
    return true;
  }
  return INTERACTIVE_ROLES.has(role);
}

function buildSelector(el: Element): { selector: string; idStable: boolean } | null {
  if (el.id && isStableId(el.id)) {
    return { selector: `#${CSS.escape(el.id)}`, idStable: true };
  }

  const testId = el.getAttribute("data-testid");
  if (testId) {
    return {
      selector: `[data-testid="${escapeAttr(testId)}"]`,
      idStable: true,
    };
  }

  const ariaLabel = el.getAttribute("aria-label")?.trim();
  if (ariaLabel) {
    return {
      selector: `[aria-label="${escapeAttr(ariaLabel)}"]`,
      idStable: true,
    };
  }

  const title = el.getAttribute("title")?.trim();
  if (title) {
    const tag = el.tagName.toLowerCase();
    return {
      selector: `${tag}[title="${escapeAttr(title)}"]`,
      idStable: true,
    };
  }

  const tag = el.tagName.toLowerCase();

  if (el instanceof HTMLAnchorElement) {
    const href = getStableHref(el);
    if (href) {
      return {
        selector: `a[href="${escapeAttr(href)}"]`,
        idStable: true,
      };
    }
  }

  // Icon-only controls often carry their name via aria-labelledby with no other
  // hook. Keep them targetable; playback re-resolves by accessible name, so an
  // unstable referenced id here is fine.
  const labelledBy = el.getAttribute("aria-labelledby")?.trim();
  if (labelledBy) {
    return {
      selector: `${tag}[aria-labelledby="${escapeAttr(labelledBy)}"]`,
      idStable: labelledBy.split(/\s+/).every(isStableId),
    };
  }

  if (el.id) {
    return { selector: `#${CSS.escape(el.id)}`, idStable: false };
  }

  return null;
}

function readAriaBoolean(el: Element, attr: string): boolean | undefined {
  const value = el.getAttribute(attr);
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  return undefined;
}

function readExpanded(el: Element): boolean | undefined {
  return readAriaBoolean(el, "aria-expanded");
}

function readHasPopup(el: Element): string | undefined {
  const value = el.getAttribute("aria-haspopup")?.trim();
  return value || undefined;
}

function readSelected(el: Element): boolean | undefined {
  return readAriaBoolean(el, "aria-selected");
}

function readPressed(el: Element): boolean | undefined {
  return readAriaBoolean(el, "aria-pressed");
}

function readChecked(el: Element): boolean | undefined {
  if (
    el instanceof HTMLInputElement &&
    (el.type === "checkbox" || el.type === "radio")
  ) {
    return el.checked;
  }
  return readAriaBoolean(el, "aria-checked");
}

export function captureDom(): DomElement[] {
  const elements = document.querySelectorAll(INTERACTIVE_SELECTOR);
  const results: DomElement[] = [];

  for (const element of elements) {
    if (results.length >= MAX_ELEMENTS) {
      break;
    }

    const role = getRole(element);
    if (!isInteractiveElement(element, role)) {
      continue;
    }

    if (isHidden(element)) {
      continue;
    }

    const built = buildSelector(element);
    if (!built) {
      continue;
    }

    const tag = element.tagName.toLowerCase();
    const fieldValue = getFieldValue(element);
    const text = getText(element) || fieldValue.slice(0, 200);
    const ariaLabel = getAccessibleName(element);
    const placeholder = getPlaceholder(element);

    if (!hasMeaningfulLabel(text, ariaLabel, placeholder, fieldValue)) {
      continue;
    }

    const controlKind = inferControlKind(element, role);
    const expanded = readExpanded(element);
    const hasPopup = readHasPopup(element);
    const selected = readSelected(element);
    const pressed = readPressed(element);
    const checked = readChecked(element);

    results.push({
      tag,
      role,
      text,
      selector: built.selector,
      ariaLabel,
      placeholder,
      idStable: built.idStable,
      ...(controlKind ? { controlKind } : {}),
      ...(expanded !== undefined ? { expanded } : {}),
      ...(hasPopup ? { hasPopup } : {}),
      ...(selected !== undefined ? { selected } : {}),
      ...(pressed !== undefined ? { pressed } : {}),
      ...(checked !== undefined ? { checked } : {}),
    });
  }

  return results;
}

declare global {
  interface Window {
    __patchCaptureDom?: () => DomElement[];
  }
}

window.__patchCaptureDom = captureDom;
