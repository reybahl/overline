export type DomControlKind =
  | "action-button"
  | "disclosure"
  | "dropdown-trigger"
  | "link"
  | "menu-item"
  | "nav-tab";

export type DomElement = {
  tag: string;
  role: string;
  text: string;
  selector: string;
  ariaLabel: string;
  placeholder: string;
  idStable: boolean;
  controlKind?: DomControlKind;
  /** Stable href-like target text for links, usually pathname + search or a hash. */
  href?: string;
  title?: string;
  expanded?: boolean;
  hasPopup?: string;
  /** aria-selected - true once a tab/option is active. */
  selected?: boolean;
  /** aria-pressed - true for an engaged toggle button. */
  pressed?: boolean;
  /** checked state for checkboxes/radios/aria-checked. */
  checked?: boolean;
};

export type SearchInteractivesOptions = {
  limit?: number;
  controlKind?: DomControlKind | string;
};

export type ListInteractivesOptions = {
  offset?: number;
  limit?: number;
  controlKind?: DomControlKind | string;
  toggleFirst?: boolean;
};

export type ListInteractivesResult = {
  elements: DomElement[];
  total: number;
  offset: number;
  limit: number;
};
