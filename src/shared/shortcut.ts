const MODIFIER_KEYS = new Set(["control", "shift", "alt", "meta"]);

export function normalizeShortcut(shortcut: string): string {
  return shortcut
    .split("+")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean)
    .join("+");
}

export function eventToShortcut(event: KeyboardEvent): string | null {
  const mods: string[] = [];
  if (event.ctrlKey) mods.push("ctrl");
  if (event.altKey) mods.push("alt");
  if (event.shiftKey) mods.push("shift");
  if (event.metaKey) mods.push("meta");

  if (mods.length === 0) {
    return null;
  }

  let key = event.key;
  if (key === " ") {
    key = "space";
  } else {
    key = key.toLowerCase();
  }

  if (MODIFIER_KEYS.has(key)) {
    return null;
  }

  return [...mods, key].join("+");
}

const OPEN_PALETTE_SHORTCUTS = new Set(["meta+shift+p", "ctrl+shift+p"]);

export function isReservedPaletteShortcut(shortcut: string): boolean {
  return OPEN_PALETTE_SHORTCUTS.has(normalizeShortcut(shortcut));
}

export function formatShortcutForDisplay(shortcut: string): string {
  const isMac =
    typeof navigator !== "undefined" &&
    /Mac|iPhone|iPad/i.test(navigator.platform);

  const parts = normalizeShortcut(shortcut).split("+").map((part) => {
    switch (part) {
      case "ctrl":
        return isMac ? "⌃" : "Ctrl";
      case "meta":
        return isMac ? "⌘" : "Win";
      case "alt":
        return isMac ? "⌥" : "Alt";
      case "shift":
        return isMac ? "⇧" : "Shift";
      case "space":
        return "Space";
      default:
        return part.length === 1
          ? part.toUpperCase()
          : part.charAt(0).toUpperCase() + part.slice(1);
    }
  });

  return isMac ? parts.join("") : parts.join("+");
}

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) {
    return false;
  }

  return (
    target.closest(
      'input, textarea, select, [contenteditable=""], [contenteditable="true"]',
    ) !== null
  );
}
