import { createLogger } from "@/shared/logger";

const log = createLogger("clipboard");

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

function readElementText(el: Element): string {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    return el.value.trim();
  }

  const text = (el as HTMLElement).innerText ?? el.textContent ?? "";
  return text.trim().replace(/\s+/g, " ");
}

export function extractCopyText(element: HTMLElement): string | null {
  const tag = element.tagName.toLowerCase();

  if (tag === "clipboard-copy") {
    const value = element.getAttribute("value")?.trim();
    if (value) {
      return value;
    }

    const forId = element.getAttribute("for")?.trim();
    if (forId) {
      const target = document.getElementById(forId);
      if (target) {
        const text = readElementText(target);
        if (text) {
          return text;
        }
      }
    }
  }

  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement
  ) {
    return element.value.trim() || null;
  }

  const ariaLabel = element.getAttribute("aria-label")?.trim() ?? "";
  if (/\b(copy|clipboard)\b/i.test(ariaLabel)) {
    const siblingInput = element
      .closest("form, div, li, section, [role='tabpanel']")
      ?.querySelector("input[readonly], textarea[readonly], input[type='text']");
    if (siblingInput instanceof HTMLInputElement) {
      return siblingInput.value.trim() || null;
    }
  }

  return null;
}

export function writeClipboard(text: string): void {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();

  const copied = document.execCommand("copy");
  textarea.remove();

  if (!copied) {
    throw new Error("Failed to copy text to clipboard.");
  }

  log.info("wrote clipboard", {
    chars: text.length,
    preview: text.slice(0, 80),
  });
}

export async function performCopyAction(element: HTMLElement): Promise<void> {
  const text = extractCopyText(element);
  if (!text) {
    log.warn("copy action fell back to click — no text extracted", {
      tag: element.tagName.toLowerCase(),
      ariaLabel: element.getAttribute("aria-label"),
    });
    element.click();
    return;
  }

  writeClipboard(text);
  element.click();
}

export function scoreCopyCandidate(el: HTMLElement): number {
  let score = 0;
  const forId = el.getAttribute("for")?.trim() ?? "";

  if (forId === "clone-with-gh-cli") {
    score += 100;
  } else if (forId.includes("gh-cli")) {
    score += 50;
  }

  const target = forId ? document.getElementById(forId) : null;
  if (target instanceof HTMLInputElement && isVisible(target)) {
    score += 20;
    if (/gh repo clone|git@github.com:/.test(target.value)) {
      score += 30;
    }
  }

  return score;
}

export function pickBestCopyCandidate(
  candidates: HTMLElement[],
): HTMLElement | undefined {
  const visible = candidates.filter(isVisible);
  if (visible.length === 0) {
    return undefined;
  }

  return [...visible].sort(
    (a, b) => scoreCopyCandidate(b) - scoreCopyCandidate(a),
  )[0];
}
