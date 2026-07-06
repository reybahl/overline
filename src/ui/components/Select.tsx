import { Select as BaseSelect } from "@base-ui/react/select";
import type { ReactNode } from "react";

import { cn } from "@/ui/components/cn";

export type SelectItem = {
  label: ReactNode;
  value: string;
};

type SelectProps = {
  value: string;
  onValueChange: (value: string) => void;
  items: SelectItem[];
  className?: string;
  placeholder?: string;
  disabled?: boolean;
};

export function Select({
  value,
  onValueChange,
  items,
  className,
  placeholder,
  disabled,
}: SelectProps) {
  return (
    <BaseSelect.Root
      items={items}
      value={value}
      onValueChange={(next) => {
        if (typeof next === "string") {
          onValueChange(next);
        }
      }}
      disabled={disabled}
    >
      <BaseSelect.Trigger className={cn("ui-input ui-select-trigger", className)}>
        <BaseSelect.Value placeholder={placeholder} />
        <BaseSelect.Icon className="ui-select-icon" aria-hidden>
          ▾
        </BaseSelect.Icon>
      </BaseSelect.Trigger>
      <BaseSelect.Portal>
        <BaseSelect.Positioner className="ui-select-positioner" sideOffset={4}>
          <BaseSelect.Popup className="ui-select-popup">
            <BaseSelect.List className="ui-select-list">
              {items.map((item) => (
                <BaseSelect.Item
                  key={String(item.value)}
                  value={item.value}
                  className="ui-select-item"
                >
                  <BaseSelect.ItemText>{item.label}</BaseSelect.ItemText>
                </BaseSelect.Item>
              ))}
            </BaseSelect.List>
          </BaseSelect.Popup>
        </BaseSelect.Positioner>
      </BaseSelect.Portal>
    </BaseSelect.Root>
  );
}
