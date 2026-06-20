const INTERACTIVE_SELECTOR = [
  "button",
  "a",
  "input",
  "select",
  "textarea",
  '[role="button"]',
  '[role="tab"]',
  '[role="menuitem"]',
  '[role="option"]',
  '[role="menuitemradio"]',
  '[role="menuitemcheckbox"]',
  '[role="switch"]',
  '[role="checkbox"]',
  '[role="radio"]',
].join(", ");

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

/** Generated framework ids — prefer role/text selectors over these. */
function isStableId(id: string): boolean {
  if (!id) {
    return false;
  }
  if (id.startsWith("_R_") || id.startsWith("react-aria")) {
    return false;
  }
  if (/^:r[0-9a-z]+:$/i.test(id)) {
    return false;
  }
  if (/^[a-f0-9-]{20,}$/i.test(id)) {
    return false;
  }
  return true;
}

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
};

function escapeAttr(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function isHidden(el: Element): boolean {
  if (!(el instanceof HTMLElement)) {
    return true;
  }

  if (el.hidden) {
    return true;
  }

  if (el instanceof HTMLInputElement && el.type === "hidden") {
    return true;
  }

  if (el.getAttribute("aria-hidden") === "true") {
    return true;
  }

  const style = window.getComputedStyle(el);
  if (
    style.display === "none" ||
    style.visibility === "hidden" ||
    Number.parseFloat(style.opacity) === 0
  ) {
    return true;
  }

  const rect = el.getBoundingClientRect();
  return rect.width === 0 && rect.height === 0;
}

function getText(el: Element): string {
  const text = (el as HTMLElement).innerText ?? el.textContent ?? "";
  return text.trim().replace(/\s+/g, " ").slice(0, 200);
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
): boolean {
  return text.length > 0 || ariaLabel.length > 0 || placeholder.length > 0;
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

  if (el instanceof HTMLAnchorElement) {
    const href = getStableHref(el);
    if (href) {
      return {
        selector: `a[href="${escapeAttr(href)}"]`,
        idStable: true,
      };
    }
  }

  if (el.id) {
    return { selector: `#${CSS.escape(el.id)}`, idStable: false };
  }

  return null;
}

function readExpanded(el: Element): boolean | undefined {
  const value = el.getAttribute("aria-expanded");
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  return undefined;
}

function readHasPopup(el: Element): string | undefined {
  const value = el.getAttribute("aria-haspopup")?.trim();
  return value || undefined;
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
    const text = getText(element);
    const ariaLabel = element.getAttribute("aria-label")?.trim() ?? "";
    const placeholder = getPlaceholder(element);

    if (!hasMeaningfulLabel(text, ariaLabel, placeholder)) {
      continue;
    }

    const controlKind = inferControlKind(element, role);
    const expanded = readExpanded(element);
    const hasPopup = readHasPopup(element);

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
