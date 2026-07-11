import type { DomElement, SearchInteractivesOptions } from "@/shared/types/dom";

const DEFAULT_RESULT_LIMIT = 20;
const MAX_RESULT_LIMIT = 50;

/** Fuzzy prefix/substring needs this many chars — else "refresh" hits shortcut "r". */
const MIN_FUZZY_TOKEN_LENGTH = 3;

type SearchField = {
  value: string;
  weight: number;
};

export function clampSearchLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit)) {
    return DEFAULT_RESULT_LIMIT;
  }
  return Math.min(Math.max(Math.floor(limit ?? DEFAULT_RESULT_LIMIT), 1), MAX_RESULT_LIMIT);
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

  // Short tokens (keyboard shortcut letters, etc.) must match exactly.
  if (token.length < MIN_FUZZY_TOKEN_LENGTH) {
    return 0;
  }

  if (
    fieldTokens.some(
      (fieldToken) =>
        fieldToken.length >= MIN_FUZZY_TOKEN_LENGTH &&
        (fieldToken.startsWith(token) || token.startsWith(fieldToken)),
    )
  ) {
    return 5;
  }
  if (
    fieldTokens.some(
      (fieldToken) =>
        fieldToken.length >= MIN_FUZZY_TOKEN_LENGTH &&
        (fieldToken.includes(token) || token.includes(fieldToken)),
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
      const substringScore =
        token.length >= MIN_FUZZY_TOKEN_LENGTH && field.normalized.includes(token)
          ? 2
          : 0;
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

/** Rank pre-indexed interactives by query. Pure — no DOM. */
export function rankInteractives(
  elements: DomElement[],
  query: string,
  options?: SearchInteractivesOptions,
): DomElement[] {
  const queryTokens = tokensFor(query);
  if (queryTokens.length === 0) {
    return [];
  }

  const limit = clampSearchLimit(options?.limit);

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
