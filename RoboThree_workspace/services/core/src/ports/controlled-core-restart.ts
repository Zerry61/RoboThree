import type {
  RuntimeActivationTarget,
} from "./runtime-activation-persistence.js";

export type ControlledCoreRestartIntent = Readonly<{
  activationAttemptId: string;
  target: RuntimeActivationTarget;
}>;

/**
 * Internal semantic boundary only. It deliberately exposes no PID, command,
 * argv, Electron channel, credential or process handle.
 */
export interface ControlledCoreRestartPort {
  requestControlledRestart(intent: ControlledCoreRestartIntent): Promise<void>;
  observeStartupIntent(): Promise<ControlledCoreRestartIntent | undefined>;
}
