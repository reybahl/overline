import {
  indexInteractives,
  orderInteractivesForBrowse,
} from "@/content/dom-capture";
import type {
  DomElement,
  ListInteractivesOptions,
  ListInteractivesResult,
  SearchInteractivesOptions,
} from "@/shared/types/dom";

const DEFAULT_RESULT_LIMIT = 20;
const MAX_RESULT_LIMIT = 50;

type SearchField = {
  value: string;
  weight: number;
};

function clampLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit)) {
    return DEFAULT_RESULT_LIMIT;
  }
  return Math.min(Math.max(Math.floor(limit ?? DEFAULT_RESULT_LIMIT), 1), MAX_RESULT_LIMIT);
}

function clampOffset(offset: number | undefined): number {
  if (!Number.isFinite(offset)) {
    return 0;
  }
  return Math.max(Math.floor(offset ?? 0), 0);
}

function normalizeText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function tokensFor(value: string): string[] {
  const normalized = normalizeText(value);
  return normalized ? normalized.split(" ") : [];
}

function searchFieldsFor(element: DomElement): SearchField[] {
  return [
    { value: element.ariaLabel, weight: 6 },
    { value: element.text, weight: 5 },
    { value: element.placeholder, weight: 4 },
    { value: element.title ?? "", weight: 4 },
    { value: element.href ?? "", weight: 3 },
  ];
}

function scoreTokenAgainstField(token: string, fieldTokens: string[]): number {
  if (fieldTokens.some((fieldToken) => fieldToken === token)) {
    return 8;
  }
  if (
    fieldTokens.some(
      (fieldToken) =>
        fieldToken.startsWith(token) || token.startsWith(fieldToken),
    )
  ) {
    return 5;
  }
  if (
    fieldTokens.some(
      (fieldToken) => fieldToken.includes(token) || token.includes(fieldToken),
    )
  ) {
    return 3;
  }
  return 0;
}

function scoreElement(element: DomElement, queryTokens: string[]): number {
  const fields = searchFieldsFor(element).map((field) => ({
    ...field,
    normalized: normalizeText(field.value),
    tokens: tokensFor(field.value),
  }));

  let score = 0;
  let hitCount = 0;
  const normalizedQuery = queryTokens.join(" ");

  for (const token of queryTokens) {
    let bestTokenScore = 0;

    for (const field of fields) {
      const tokenScore = scoreTokenAgainstField(token, field.tokens);
      const substringScore = field.normalized.includes(token) ? 2 : 0;
      bestTokenScore = Math.max(
        bestTokenScore,
        Math.max(tokenScore, substringScore) * field.weight,
      );
    }

    if (bestTokenScore > 0) {
      hitCount += 1;
      score += bestTokenScore;
    }
  }

  if (hitCount === 0) {
    return 0;
  }

  score += hitCount * 10;

  if (hitCount === queryTokens.length) {
    score += 8;
  }

  for (const field of fields) {
    if (normalizedQuery && field.normalized.includes(normalizedQuery)) {
      score += field.weight * 6;
    }
  }

  return score;
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
  const queryTokens = tokensFor(query);
  if (queryTokens.length === 0) {
    return [];
  }

  const limit = clampLimit(options?.limit);
  const elements = filterByControlKind(indexInteractives(), options?.controlKind);

  return elements
    .map((element, index) => ({
      element,
      index,
      score: scoreElement(element, queryTokens),
    }))
    .filter((result) => result.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map((result) => result.element);
}

export function listInteractives(
  options?: ListInteractivesOptions,
): ListInteractivesResult {
  const offset = clampOffset(options?.offset);
  const limit = clampLimit(options?.limit);
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
