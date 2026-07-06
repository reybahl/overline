import { Button as BaseButton } from "@base-ui/react/button";
import type { ComponentProps } from "react";

import { cn } from "@/ui/components/cn";

type ButtonVariant = "default" | "primary" | "ghost" | "destructive" | "danger" | "icon";
type ButtonSize = "default" | "sm";

type ButtonProps = Omit<ComponentProps<typeof BaseButton>, "className"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
};

const variantClass: Record<ButtonVariant, string | undefined> = {
  default: undefined,
  primary: "ui-btn--primary",
  ghost: "ui-btn--ghost",
  destructive: "ui-btn--destructive",
  danger: "ui-btn--danger",
  icon: "ui-btn--icon",
};

export function Button({
  variant = "default",
  size = "default",
  className,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <BaseButton
      type={type}
      className={cn(
        "ui-btn",
        size === "sm" && "ui-btn--sm",
        variantClass[variant],
        className,
      )}
      {...props}
    />
  );
}
