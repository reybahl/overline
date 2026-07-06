import { Field as BaseField } from "@base-ui/react/field";
import { Input as BaseInput } from "@base-ui/react/input";
import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/ui/components/cn";

type FieldGroupProps = {
  label: ReactNode;
  children: ReactNode;
  className?: string;
};

export function FieldGroup({ label, children, className }: FieldGroupProps) {
  return (
    <BaseField.Root className={cn("ui-field", className)}>
      <BaseField.Label className="ui-label">{label}</BaseField.Label>
      {children}
    </BaseField.Root>
  );
}

type TextInputProps = Omit<ComponentProps<typeof BaseInput>, "className"> & {
  mono?: boolean;
  className?: string;
};

export function TextInput({ className, mono, ...props }: TextInputProps) {
  return (
    <BaseInput
      className={cn("ui-input", mono && "ui-input--mono", className)}
      {...props}
    />
  );
}

type TextAreaProps = ComponentProps<"textarea"> & {
  mono?: boolean;
};

export function TextArea({ className, mono, ...props }: TextAreaProps) {
  return (
    <textarea
      className={cn("ui-input", mono && "ui-input--mono", className)}
      {...props}
    />
  );
}
