export function isVisible(el: Element): boolean {
  if (!(el instanceof HTMLElement)) {
    return false;
  }

  if (typeof el.checkVisibility === "function") {
    try {
      return el.checkVisibility({
        checkOpacity: true,
        checkVisibilityCSS: true,
        contentVisibilityAuto: true,
      });
    } catch {
      // Fall through to legacy checks.
    }
  }

  if (el.hidden || el.getAttribute("aria-hidden") === "true") {
    return false;
  }

  const style = window.getComputedStyle(el);
  if (
    style.display === "none" ||
    style.visibility === "hidden" ||
    Number.parseFloat(style.opacity) === 0
  ) {
    return false;
  }

  const rect = el.getBoundingClientRect();
  return rect.width > 0 || rect.height > 0;
}
