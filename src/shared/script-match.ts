import type { DomElement } from "@/content/dom-capture";
import type { ElementMatch } from "@/shared/types/script";

export function normalizeElementId(id: string): string {
  return id.startsWith("#") ? id.slice(1) : id;
}

export function normalizeElementMatch(match: ElementMatch): ElementMatch {
  if (!match.id) {
    return match;
  }

  const id = normalizeElementId(match.id);
  return id === match.id ? match : { ...match, id };
}

export function isCopyIntentLabel(label: string | undefined): boolean {
  return Boolean(label && /\bcopy\b/i.test(label));
}

export function findCopyControl(elements: DomElement[]): DomElement | undefined {
  return elements.find(
    (el) => el.controlKind === "copy-button" || el.tag === "clipboard-copy",
  );
}
