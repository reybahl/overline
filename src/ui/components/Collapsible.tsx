import { Collapsible as BaseCollapsible } from "@base-ui/react/collapsible";
import type { ReactNode } from "react";

import { cn } from "@/ui/components/cn";

type DisclosureProps = {
  summary: ReactNode;
  children: ReactNode;
  className?: string;
  summaryClassName?: string;
  defaultOpen?: boolean;
};

export function Disclosure({
  summary,
  children,
  className,
  summaryClassName,
  defaultOpen,
}: DisclosureProps) {
  return (
    <BaseCollapsible.Root className={cn("ui-disclosure", className)} defaultOpen={defaultOpen}>
      <BaseCollapsible.Trigger
        className={cn("ui-disclosure__summary", summaryClassName)}
      >
        {summary}
      </BaseCollapsible.Trigger>
      <BaseCollapsible.Panel keepMounted>{children}</BaseCollapsible.Panel>
    </BaseCollapsible.Root>
  );
}

type CardProps = {
  summary: ReactNode;
  children: ReactNode;
};

export function Card({ summary, children }: CardProps) {
  return (
    <BaseCollapsible.Root
      className={(state) => cn("ui-card", state.open && "ui-card--open")}
    >
      <BaseCollapsible.Trigger className="ui-card__summary">{summary}</BaseCollapsible.Trigger>
      <BaseCollapsible.Panel keepMounted>
        <div className="ui-card__body">{children}</div>
      </BaseCollapsible.Panel>
    </BaseCollapsible.Root>
  );
}
