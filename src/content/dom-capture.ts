import { getAccessibleName } from "@/content/accessible-name";
import { isVisible } from "@/content/visibility";
import { INTERACTIVE_SELECTOR } from "@/shared/interactive-selector";
import { isStableId } from "@/shared/stable-id";
import type { DomControlKind, DomElement } from "@/shared/types/dom";

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

const DEFAULT_CONTEXT_LIMIT = 25;

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
  title = "",
  href = "",
): boolean {
  return (
    text.length > 0 ||
    ariaLabel.length > 0 ||
    placeholder.length > 0 ||
    fieldValue.length > 0 ||
    title.length > 0 ||
    href.length > 0
  );
}

function getStableHref(anchor: HTMLAnchorElement): string | null {
  const href = anchor.getAttribute("href")?.trim();
  if (!href || href === "#" || href.startsWith("javascript:")) {
    return null;
  }
  return href;
}

function normalizeHref(href: string): string {
  if (href.startsWith("#")) {
    return href;
  }

  try {
    const resolved = new URL(href, window.location.href);
    return resolved.pathname + resolved.search;
  } catch {
    return href;
  }
}

function readHref(el: Element): string | undefined {
  if (!(el instanceof HTMLAnchorElement)) {
    return undefined;
  }

  const href = getStableHref(el);
  return href ? normalizeHref(href) : undefined;
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

function inferControlKind(
  el: Element,
  role: string,
): DomControlKind | undefined {
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

function isToggleEntry(element: DomElement): boolean {
  return element.pressed !== undefined || element.checked !== undefined;
}

function isExpandedContextEntry(element: DomElement): boolean {
  return element.expanded === true || element.controlKind === "menu-item";
}

function buildDomEntry(element: Element): DomElement | null {
  const role = getRole(element);
  if (!isInteractiveElement(element, role) || isHidden(element)) {
    return null;
  }

  const built = buildSelector(element);
  if (!built) {
    return null;
  }

  const tag = element.tagName.toLowerCase();
  const fieldValue = getFieldValue(element);
  const text = getText(element) || fieldValue.slice(0, 200);
  const ariaLabel = getAccessibleName(element);
  const placeholder = getPlaceholder(element);
  const href = readHref(element) ?? "";
  const title = element.getAttribute("title")?.trim() ?? "";

  if (!hasMeaningfulLabel(text, ariaLabel, placeholder, fieldValue, title, href)) {
    return null;
  }

  const controlKind = inferControlKind(element, role);
  const expanded = readExpanded(element);
  const hasPopup = readHasPopup(element);
  const selected = readSelected(element);
  const pressed = readPressed(element);
  const checked = readChecked(element);

  return {
    tag,
    role,
    text,
    selector: built.selector,
    ariaLabel,
    placeholder,
    idStable: built.idStable,
    ...(controlKind ? { controlKind } : {}),
    ...(href ? { href } : {}),
    ...(title ? { title } : {}),
    ...(expanded !== undefined ? { expanded } : {}),
    ...(hasPopup ? { hasPopup } : {}),
    ...(selected !== undefined ? { selected } : {}),
    ...(pressed !== undefined ? { pressed } : {}),
    ...(checked !== undefined ? { checked } : {}),
  };
}

export function indexInteractives(): DomElement[] {
  const elements = document.querySelectorAll(INTERACTIVE_SELECTOR);
  const results: DomElement[] = [];

  for (const element of elements) {
    const entry = buildDomEntry(element);
    if (entry) {
      results.push(entry);
    }
  }

  return results;
}

export function orderInteractivesForBrowse(
  elements: DomElement[],
  options?: { toggleFirst?: boolean },
): DomElement[] {
  if (!options?.toggleFirst) {
    return elements;
  }

  return [...elements].sort((a, b) => {
    const toggleDelta = Number(isToggleEntry(b)) - Number(isToggleEntry(a));
    return toggleDelta;
  });
}

export function captureDom(): DomElement[] {
  const elements = indexInteractives();
  const selected = new Set<number>();

  elements.forEach((element, index) => {
    if (isToggleEntry(element) || isExpandedContextEntry(element)) {
      selected.add(index);
    }
  });

  for (let index = 0; index < elements.length; index += 1) {
    if (selected.size >= DEFAULT_CONTEXT_LIMIT) {
      break;
    }
    selected.add(index);
  }

  return elements.filter((_, index) => selected.has(index));
}

declare global {
  interface Window {
    __patchCaptureDom?: () => DomElement[];
  }
}

window.__patchCaptureDom = captureDom;
