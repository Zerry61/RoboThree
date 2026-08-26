import { TaskCommandSchema, TaskRunStateSchema } from "@robothree/contracts";
import type { TaskCommand, TaskRunState } from "@robothree/contracts";

import { reduceTaskState } from "./task-state-reducer.js";
import type { TaskCommandResult } from "./task-state-reducer.js";

export class InMemoryTaskRuntime {
  #state: TaskRunState;
  #mailbox: Promise<void> = Promise.resolve();

  constructor(initialState: TaskRunState) {
    this.#state = deepFreeze(TaskRunStateSchema.parse(initialState));
  }

  get snapshot(): TaskRunState {
    return this.#state;
  }

  dispatch(input: TaskCommand): Promise<TaskCommandResult> {
    const operation = this.#mailbox.then(() => {
      const command = TaskCommandSchema.parse(input);
      const result = reduceTaskState(this.#state, command);
      if (result.accepted) {
        this.#state = result.state;
      }
      return result;
    });

    this.#mailbox = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  }
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value)) {
    deepFreeze(child);
  }
  return Object.freeze(value);
}
