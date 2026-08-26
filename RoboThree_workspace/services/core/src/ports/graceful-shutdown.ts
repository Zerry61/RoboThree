export type GracefulShutdownReport = Readonly<{
  activeAtStart: number;
  completedBeforeDeadline: number;
  timedOutWorkIds: readonly string[];
}>;

export interface GracefulShutdownController {
  startAccepting(): void;
  beginShutdown(timeoutMs: number): Promise<GracefulShutdownReport>;
}
