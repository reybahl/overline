/**
 * Resolve an element's accessible name the way assistive tech does, in priority
 * order: `aria-label`, then the joined text of `aria-labelledby` targets, then
 * `title`. This is what lets us see and target icon-only controls (e.g. a copy
 * button whose only label is `aria-labelledby` pointing at a tooltip).
 *
 * It is intentionally a pragmatic subset of the full accname algorithm — enough
 * for the labelling patterns real sites use, without a CDP round-trip.
 */
export function getAccessibleName(el: Element): string {
  const ariaLabel = el.getAttribute("aria-label")?.trim() ?? "";
  if (ariaLabel) {
    return ariaLabel;
  }

  const labelledBy = el.getAttribute("aria-labelledby")?.trim();
  if (labelledBy) {
    const labelText = labelledBy
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent?.trim() ?? "")
      .filter(Boolean)
      .join(" ");
    if (labelText) {
      return labelText;
    }
  }

  return el.getAttribute("title")?.trim() ?? "";
}
