import { getAccessibleName } from "@/content/accessible-name";
import { getVisibleText } from "@/content/element-text";
import { isStableId } from "@/shared/stable-id";
import type { ElementMatch } from "@/shared/types/script";

/**
 * Derive a replayable {@link ElementMatch} from a live element at click time.
 *
 * Returns multiple fields when available (e.g. href + text + testId) so compile can
 * choose the right generalization strategy. Stable id alone still wins early return.
 */
const MATCHABLE_TAGS = new Set(["a", "button", "input", "select", "textarea"]);

const MAX_TEXT_LENGTH = 120;

function matchableTag(el: Element): ElementMatch["tag"] | undefined {
  const tag = el.tagName.toLowerCase();
  return MATCHABLE_TAGS.has(tag) ? (tag as ElementMatch["tag"]) : undefined;
}

/** Pathname + search relative to the page — easier for compile to count segments. */
function normalizeHrefSuffix(href: string): string {
  if (href.startsWith("#")) {
    return href;
  }

  try {
    const resolved = new URL(href, window.location.href);
    const path = resolved.pathname + resolved.search;
    return path || href;
  } catch {
    return href;
  }
}

function stableHref(el: Element): string | undefined {
  if (!(el instanceof HTMLAnchorElement)) {
    return undefined;
  }

  const href = el.getAttribute("href")?.trim();
  if (!href || href === "#" || href.startsWith("javascript:")) {
    return undefined;
  }

  return normalizeHrefSuffix(href);
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

function readPressed(el: Element): boolean | undefined {
  return readAriaBoolean(el, "aria-pressed");
}

export function deriveElementMatch(el: Element): ElementMatch {
  if (el.id && isStableId(el.id)) {
    return { id: el.id };
  }

  const tag = matchableTag(el);
  const match: ElementMatch = tag ? { tag } : {};

  const testId = el.getAttribute("data-testid")?.trim();
  if (testId) {
    match.testId = testId;
  }

  const href = stableHref(el);
  if (href) {
    match.hrefSuffix = href;
    match.tag = "a";
  }

  const text = getVisibleText(el);
  if (text) {
    match.text = text.slice(0, MAX_TEXT_LENGTH);
  }

  const ariaLabel = getAccessibleName(el);
  if (ariaLabel) {
    match.ariaLabel = ariaLabel;
  }

  const pressed = readPressed(el);
  if (pressed !== undefined) {
    match.pressed = pressed;
  }

  if (
    match.hrefSuffix ||
    match.text ||
    match.ariaLabel ||
    match.pressed !== undefined ||
    match.testId ||
    match.tag
  ) {
    return match;
  }

  return match;
}
