import type { InjectionKey } from "vue";

export type DesktopRuntimeMode = "standard" | "local_demo";

export const runtimeModeKey: InjectionKey<DesktopRuntimeMode> =
  Symbol("RoboThreeDesktopRuntimeMode");

export function configuredRuntimeMode(): DesktopRuntimeMode {
  return import.meta.env.VITE_ROBOTHREE_RUNTIME_MODE === "local_demo"
    ? "local_demo"
    : "standard";
}

