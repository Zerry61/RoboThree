export type ScheduledTask = {
  cancel(): void;
};

export interface Scheduler {
  schedule(delayMs: number, callback: () => void): ScheduledTask;
  sleep(delayMs: number, signal?: AbortSignal): Promise<"elapsed" | "cancelled">;
}
