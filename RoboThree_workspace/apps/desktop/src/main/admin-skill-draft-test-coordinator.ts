import type { CorePrivateSupervisor } from "./core-private-supervisor.js";
import type { SkillInstallationService } from "./skill-installation-service.js";

/** Main-owned bridge that materializes an exact Admin draft before Core executes its real Task. */
export class AdminSkillDraftTestCoordinator {
  readonly #core: CorePrivateSupervisor;
  readonly #installations: SkillInstallationService;
  #timer: ReturnType<typeof setInterval> | undefined;
  #busy = false;

  constructor(input: Readonly<{
    core: CorePrivateSupervisor;
    installations: SkillInstallationService;
  }>) {
    this.#core = input.core;
    this.#installations = input.installations;
  }

  start(): void {
    if (this.#timer !== undefined) return;
    this.#timer = setInterval(() => void this.runOnce(), 2_000);
    void this.runOnce();
  }

  stop(): void {
    if (this.#timer !== undefined) clearInterval(this.#timer);
    this.#timer = undefined;
  }

  async runOnce(): Promise<void> {
    if (this.#busy || this.#core.snapshot().runtimeState !== "ready") return;
    this.#busy = true;
    try {
      const polled = await this.#core.client.pollAdminSkillDraftTestV1Alpha1();
      if (!polled.ok) return;
      if (!polled.value.pending) {
        await this.#installations.cleanupFinishedAdminDraftTests(this.#core.client);
        return;
      }
      const prepared = await this.#installations.prepareAdminDraftTest({
        ...polled.value,
        client: this.#core.client,
        clientInstanceId: this.#core.clientInstanceId,
      });
      if (prepared === "ready") {
        await this.#core.client.startAdminSkillDraftTestV1Alpha1(polled.value.operationId);
      }
    } catch {
      // Central remains authoritative; the next bounded poll retries without fake success.
    } finally {
      this.#busy = false;
    }
  }
}
