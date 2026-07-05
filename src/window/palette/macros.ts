import { macroNeedsParams } from "@/shared/macro-signature";
import type { Macro } from "@/shared/types/macro";
import { sendBackgroundMessage } from "@/shared/clients/background-client";
import { getMacrosForUrl, macroMatchesUrl } from "@/shared/macro-match";
import { formatShortcutForDisplay } from "@/shared/shortcut";
import {
  getActiveTab,
  getRestrictedPageMessage,
  isInjectableUrl,
} from "@/shared/tab";
import { mountLucideIcon } from "@/ui/mount-icon";
import { Plus, Settings } from "lucide";
import { openMacroSettings } from "@/window/palette/macro-settings-host";
import { paletteActions } from "@/window/palette/actions";
import { promptMacroParams } from "@/window/palette/param-prompt";
import {
  macroEmptyEl,
  macroListEl,
  searchInput,
} from "@/window/palette/elements";
import { paletteState } from "@/window/palette/state";
import { setBusy, setStatus } from "@/window/palette/ui";

function getMacroDescription(macro: Macro): string | undefined {
  return macro.description ?? macro.intent;
}

function filterMacros(macros: Macro[], query: string): Macro[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return macros;
  }

  return macros.filter((macro) => {
    const haystack = [macro.name, macro.description, macro.intent]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(normalized);
  });
}

export function getTrimmedSearchQuery(): string {
  return searchInput.value.trim();
}

function hasCreateMacroOption(): boolean {
  return getTrimmedSearchQuery().length > 0;
}

export function getSelectableItemCount(): number {
  return paletteState.filteredMacros.length + (hasCreateMacroOption() ? 1 : 0);
}

export function isCreateMacroOptionSelected(): boolean {
  return (
    hasCreateMacroOption() &&
    paletteState.selectedIndex === paletteState.filteredMacros.length
  );
}

export function scrollSelectedIntoView(): void {
  const activeItem = macroListEl.querySelector(".ui-palette__item--active");
  activeItem?.scrollIntoView({ block: "nearest" });
}

function renderCreateMacroItem(index: number): HTMLLIElement {
  const query = getTrimmedSearchQuery();
  const item = document.createElement("li");
  item.className = "ui-palette__item ui-palette__item--create";
  if (index === paletteState.selectedIndex) {
    item.classList.add("ui-palette__item--active");
  }
  item.setAttribute("role", "option");
  item.setAttribute(
    "aria-selected",
    index === paletteState.selectedIndex ? "true" : "false",
  );

  const button = document.createElement("button");
  button.type = "button";
  button.className = "ui-palette__item-btn";
  button.addEventListener("click", () => {
    paletteActions.createMacro();
  });

  mountLucideIcon(button, Plus);

  const main = document.createElement("div");
  main.className = "ui-palette__item-main";

  const title = document.createElement("span");
  title.className = "ui-palette__item-title";
  title.textContent = `Create new macro "${query}"`;
  main.appendChild(title);

  button.appendChild(main);
  item.appendChild(button);
  return item;
}

export function renderMacroList(highlightMacroId?: string): void {
  paletteState.filteredMacros = filterMacros(
    paletteState.pageMacros,
    searchInput.value,
  );
  macroListEl.replaceChildren();
  const showCreateOption = hasCreateMacroOption();

  if (highlightMacroId) {
    const highlightIndex = paletteState.filteredMacros.findIndex(
      (macro) => macro.id === highlightMacroId,
    );
    paletteState.selectedIndex = highlightIndex >= 0 ? highlightIndex : 0;
  }

  const itemCount = getSelectableItemCount();
  if (itemCount === 0) {
    macroEmptyEl.hidden = false;
    macroEmptyEl.textContent =
      paletteState.pageMacros.length === 0
        ? paletteState.currentTabUrl
          ? "No macros for this page"
          : "No macros saved"
        : "No matching macros";
    paletteState.selectedIndex = 0;
    return;
  }

  macroEmptyEl.hidden = true;

  if (paletteState.selectedIndex >= itemCount) {
    paletteState.selectedIndex = itemCount - 1;
  }
  if (paletteState.selectedIndex < 0) {
    paletteState.selectedIndex = 0;
  }

  for (const [index, macro] of paletteState.filteredMacros.entries()) {
    const item = document.createElement("li");
    item.className = "ui-palette__item";
    if (index === paletteState.selectedIndex) {
      item.classList.add("ui-palette__item--active");
    }
    item.setAttribute("role", "option");
    item.setAttribute(
      "aria-selected",
      index === paletteState.selectedIndex ? "true" : "false",
    );

    const row = document.createElement("div");
    row.className = "ui-palette__item-row";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "ui-palette__item-btn";
    button.addEventListener("click", () => {
      paletteActions.runMacro(macro);
    });

    const main = document.createElement("div");
    main.className = "ui-palette__item-main";

    const title = document.createElement("span");
    title.className = "ui-palette__item-title";
    title.textContent = macro.name;
    main.appendChild(title);

    const description = getMacroDescription(macro);
    if (description) {
      const subtitle = document.createElement("span");
      subtitle.className = "ui-palette__item-desc";
      subtitle.textContent = description;
      main.appendChild(subtitle);
    }

    button.appendChild(main);

    if (macro.shortcut) {
      const shortcut = document.createElement("kbd");
      shortcut.className = "ui-kbd ui-kbd--compact";
      shortcut.textContent = formatShortcutForDisplay(macro.shortcut);
      button.appendChild(shortcut);
    }

    row.appendChild(button);

    const settingsBtn = document.createElement("button");
    settingsBtn.type = "button";
    settingsBtn.className = "ui-btn ui-btn--icon ui-palette__item-settings";
    settingsBtn.title = "Macro settings";
    settingsBtn.setAttribute("aria-label", `Settings for ${macro.name}`);
    settingsBtn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openMacroSettings(macro);
    });
    mountLucideIcon(settingsBtn, Settings);
    row.appendChild(settingsBtn);

    item.appendChild(row);
    macroListEl.appendChild(item);
  }

  if (showCreateOption) {
    macroListEl.appendChild(
      renderCreateMacroItem(paletteState.filteredMacros.length),
    );
  }
}

export async function refreshMacros(preferredMacroId?: string): Promise<void> {
  const tab = await getActiveTab();
  paletteState.currentTabUrl = tab.url ?? "";

  const macrosResponse = await sendBackgroundMessage({ type: "GET_MACROS" });

  if (!macrosResponse.ok) {
    throw new Error(macrosResponse.error);
  }

  paletteState.savedMacros = macrosResponse.macros;
  paletteState.pageMacros = paletteState.currentTabUrl
    ? getMacrosForUrl(paletteState.savedMacros, paletteState.currentTabUrl)
    : [];

  renderMacroList(preferredMacroId);
}

export async function handleRunMacro(macro?: Macro): Promise<void> {
  const selected =
    macro ?? paletteState.filteredMacros[paletteState.selectedIndex];
  if (!selected) {
    setStatus("No macro selected.", true);
    return;
  }

  const target =
    paletteState.savedMacros.find((entry) => entry.id === selected.id) ?? selected;

  setBusy(true);

  try {
    const tab = await getActiveTab();
    const tabId = tab.id;
    const url = tab.url;

    if (tabId === undefined) {
      throw new Error("No active tab found.");
    }
    if (!url || !isInjectableUrl(url)) {
      throw new Error(getRestrictedPageMessage(url));
    }
    if (!macroMatchesUrl(target, url)) {
      throw new Error(`"${target.name}" does not run on this page.`);
    }

    const needsParams = macroNeedsParams(target);
    const params = needsParams ? await promptMacroParams(target) : {};
    if (params === null) {
      setStatus("Cancelled.");
      return;
    }

    setStatus(`Running "${target.name}"…`);

    const response = await sendBackgroundMessage({
      type: "EXECUTE_MACRO",
      tabId,
      macroId: target.id,
      ...(needsParams ? { params } : {}),
    });

    if (!response.ok) {
      throw new Error(response.error ?? "Failed to run macro.");
    }

    setStatus(`Ran macro "${target.name}"`);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Failed to run macro";
    setStatus(errorMessage, true);
  } finally {
    setBusy(false);
  }
}

export async function handleRunSelectedMacro(): Promise<void> {
  if (isCreateMacroOptionSelected()) {
    paletteActions.createMacro();
    return;
  }

  await handleRunMacro();
}
