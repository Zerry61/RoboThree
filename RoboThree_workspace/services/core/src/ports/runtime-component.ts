import type { ComponentHealth } from "@robothree/contracts";

export interface RuntimeComponent {
  readonly componentId: string;
  start(): Promise<void>;
  stop(): Promise<void>;
  health(): Promise<ComponentHealth>;
}
