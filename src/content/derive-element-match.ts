import { getAccessibleName } from "@/content/accessible-name";
import { getVisibleText } from "@/content/element-text";
import { isStableId } from "@/shared/stable-id";
import type { ElementMatch } from "@/shared/types/script";

/**
 * Derive a replayable {@link ElementMatch} from a live element at click time.
 *
 * Priority: stable id, data-testid, anchor href, visible text, accessible name.
 * Visible text is preferred over accessible name because name computation can
 * drop whitespace between inline spans ("main default" → "maindefault").
 */
const MATCHABLE_TAGS = new Set(["a", "button", "input", "select", "textarea"]);

const MAX_TEXT_LENGTH = 120;

function matchableTag(el: Element): ElementMatch["tag"] | undefined {
  const tag = el.tagName.toLowerCase();
  return MATCHABLE_TAGS.has(tag) ? (tag as ElementMatch["tag"]) : undefined;
}

function stableHref(el: Element): string | undefined {
  if (!(el instanceof HTMLAnchorElement)) {
    return undefined;
  }

  const href = el.getAttribute("href")?.trim();
  if (!href || href === "#" || href.startsWith("javascript:")) {
    return undefined;
  }

  return href;
}

export function deriveElementMatch(el: Element): ElementMatch {
  if (el.id && isStableId(el.id)) {
    return { id: el.id };
  }

  const tag = matchableTag(el);
  const base: ElementMatch = tag ? { tag } : {};

  const testId = el.getAttribute("data-testid")?.trim();
  if (testId) {
    return { ...base, testId };
  }

  const href = stableHref(el);
  if (href) {
    return { ...base, tag: "a", hrefSuffix: href };
  }

  const text = getVisibleText(el);
  if (text) {
    return { ...base, text: text.slice(0, MAX_TEXT_LENGTH) };
  }

  const ariaLabel = getAccessibleName(el);
  if (ariaLabel) {
    return { ...base, ariaLabel };
  }

  return base;
}
