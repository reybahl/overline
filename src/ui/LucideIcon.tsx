import type { IconNode } from "lucide";
import { useLayoutEffect, useRef } from "react";

import { createLucideSVGElement } from "@/ui/mount-icon";

type LucideIconProps = {
  icon: IconNode;
};

export function LucideIcon({ icon }: LucideIconProps) {
  const ref = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    ref.current?.replaceChildren(createLucideSVGElement(icon));
  }, [icon]);

  return <span ref={ref} />;
}
