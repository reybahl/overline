import type { ScriptStepType } from "@/shared/types/script";

type ScriptStepTypeStyle = {
  background: string;
  color: string;
};

export const SCRIPT_STEP_TYPE_STYLE: Record<ScriptStepType, ScriptStepTypeStyle> = {
  click: {
    background: "color-mix(in srgb, #5e6ad2 16%, var(--ui-hover))",
    color: "color-mix(in srgb, #5e6ad2 80%, var(--ui-fg))",
  },
  fill: {
    background: "color-mix(in srgb, #3d9a6a 16%, var(--ui-hover))",
    color: "color-mix(in srgb, #3d9a6a 80%, var(--ui-fg))",
  },
  wait: {
    background: "color-mix(in srgb, #c9922e 18%, var(--ui-hover))",
    color: "color-mix(in srgb, #c9922e 82%, var(--ui-fg))",
  },
  waitFor: {
    background: "color-mix(in srgb, #9b6ad2 16%, var(--ui-hover))",
    color: "color-mix(in srgb, #9b6ad2 80%, var(--ui-fg))",
  },
  navigate: {
    background: "color-mix(in srgb, #d97757 16%, var(--ui-hover))",
    color: "color-mix(in srgb, #d97757 82%, var(--ui-fg))",
  },
};
