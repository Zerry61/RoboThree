import type {
  ControlledCoreRestartIntent,
  ControlledCoreRestartPort,
} from "../../ports/controlled-core-restart.js";

export class FakeControlledCoreRestartPort implements ControlledCoreRestartPort {
  readonly requests: ControlledCoreRestartIntent[] = [];
  readonly invocations: ControlledCoreRestartIntent[] = [];
  failure: Error | undefined;
  startupIntent: ControlledCoreRestartIntent | undefined;

  async requestControlledRestart(
    intent: ControlledCoreRestartIntent,
  ): Promise<void> {
    this.invocations.push(structuredClone(intent));
    if (this.failure !== undefined) throw this.failure;
    const existing = this.requests.find(
      (request) =>
        request.activationAttemptId === intent.activationAttemptId,
    );
    if (existing !== undefined) {
      if (JSON.stringify(existing.target) !== JSON.stringify(intent.target)) {
        throw new Error("restart attempt ID target conflict");
      }
      this.startupIntent = structuredClone(existing);
      return;
    }
    this.requests.push(structuredClone(intent));
    this.startupIntent = structuredClone(intent);
  }

  async observeStartupIntent(): Promise<
    ControlledCoreRestartIntent | undefined
  > {
    return this.startupIntent === undefined
      ? undefined
      : structuredClone(this.startupIntent);
  }
}
