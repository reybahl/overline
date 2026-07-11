import {
  indexInteractives,
  orderInteractivesForBrowse,
} from "@/content/dom-capture";
import {
  clampSearchLimit,
  rankInteractives,
} from "@/content/search-rank";
import type {
  DomElement,
  ListInteractivesOptions,
  ListInteractivesResult,
  SearchInteractivesOptions,
} from "@/shared/types/dom";

export { rankInteractives } from "@/content/search-rank";

function clampOffset(offset: number | undefined): number {
  if (!Number.isFinite(offset)) {
    return 0;
  }
  return Math.max(Math.floor(offset ?? 0), 0);
}

function filterByControlKind(
  elements: DomElement[],
  controlKind: string | undefined,
): DomElement[] {
  if (!controlKind) {
    return elements;
  }
  return elements.filter((element) => element.controlKind === controlKind);
}

export function searchInteractives(
  query: string,
  options?: SearchInteractivesOptions,
): DomElement[] {
  return rankInteractives(indexInteractives(), query, options);
}

export function listInteractives(
  options?: ListInteractivesOptions,
): ListInteractivesResult {
  const offset = clampOffset(options?.offset);
  const limit = clampSearchLimit(options?.limit);
  const filtered = filterByControlKind(
    indexInteractives(),
    options?.controlKind,
  );
  const ordered = orderInteractivesForBrowse(filtered, {
    toggleFirst: options?.toggleFirst,
  });

  return {
    elements: ordered.slice(offset, offset + limit),
    total: ordered.length,
    offset,
    limit,
  };
}
