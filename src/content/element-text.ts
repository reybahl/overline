/** Normalized visible text of an element (collapsed whitespace, trimmed). */
export function getVisibleText(el: Element): string {
  const text = (el as HTMLElement).innerText ?? el.textContent ?? "";
  return text.trim().replace(/\s+/g, " ");
}
