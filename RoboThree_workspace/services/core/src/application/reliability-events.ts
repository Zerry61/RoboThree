export type ReliabilityEvent =
  | {
    type: "admission.queued" | "admission.acquired" | "admission.released";
    requestId: string;
    kind: "run" | "tool";
    active: number;
    queued: number;
    resourceId?: string;
  }
  | {
    type: "admission.rejected";
    requestId: string;
    kind: "run" | "tool";
    reasonCode: string;
    active: number;
    queued: number;
    resourceId?: string;
  }
  | {
    type: "retry.scheduled";
    operation: string;
    attempt: number;
    delayMs: number;
    reasonCode: string;
  }
  | {
    type: "retry.stopped";
    operation: string;
    attempt: number;
    reasonCode: string;
  }
  | {
    type: "outbox.batch";
    selected: number;
    published: number;
    failed: number;
  };

export type ReliabilityObserver = (event: ReliabilityEvent) => void;

export function emitReliabilityEvent(
  observer: ReliabilityObserver | undefined,
  event: ReliabilityEvent,
): void {
  try {
    observer?.(Object.freeze(event));
  } catch {
    // Diagnostics must never change runtime correctness.
  }
}
