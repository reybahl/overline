const INTERACTIVE_SELECTOR = [
  "button",
  "a",
  "input",
  "select",
  "textarea",
].join(", ");

const INTERACTIVE_TAGS = new Set([
  "button",
  "a",
  "input",
  "select",
  "textarea",
]);

const MAX_ELEMENTS = 80;

export type DomElement = {
  tag: string;
  text: string;
  selector: string;
  ariaLabel: string;
  placeholder: string;
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

function buildSelector(el: Element): string | null {
  if (el.id) {
    return `#${CSS.escape(el.id)}`;
  }

  const testId = el.getAttribute("data-testid");
  if (testId) {
    return `[data-testid="${escapeAttr(testId)}"]`;
  }

  const ariaLabel = el.getAttribute("aria-label");
  if (ariaLabel) {
    return `[aria-label="${escapeAttr(ariaLabel)}"]`;
  }

  if (el instanceof HTMLAnchorElement) {
    const href = getStableHref(el);
    if (href) {
      return `a[href="${escapeAttr(href)}"]`;
    }
  }

  return null;
}

export function captureDom(): DomElement[] {
  const elements = document.querySelectorAll(INTERACTIVE_SELECTOR);
  const results: DomElement[] = [];

  for (const element of elements) {
    if (results.length >= MAX_ELEMENTS) {
      break;
    }

    const tag = element.tagName.toLowerCase();
    if (!INTERACTIVE_TAGS.has(tag)) {
      continue;
    }

    if (isHidden(element)) {
      continue;
    }

    const selector = buildSelector(element);
    if (!selector) {
      continue;
    }

    const text = getText(element);
    const ariaLabel = element.getAttribute("aria-label")?.trim() ?? "";
    const placeholder = getPlaceholder(element);

    if (!hasMeaningfulLabel(text, ariaLabel, placeholder)) {
      continue;
    }

    results.push({
      tag,
      text,
      selector,
      ariaLabel,
      placeholder,
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
