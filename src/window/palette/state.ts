import type { Macro } from "@/shared/types/macro";

export const paletteState = {
  savedMacros: [] as Macro[],
  pageMacros: [] as Macro[],
  filteredMacros: [] as Macro[],
  selectedIndex: 0,
  currentTabUrl: "",
  pendingMacro: null as Macro | null,
  pendingRecordPoll: undefined as number | undefined,
};
