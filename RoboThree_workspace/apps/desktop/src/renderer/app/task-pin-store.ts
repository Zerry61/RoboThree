import {
  readonly,
  shallowRef,
  type DeepReadonly,
  type InjectionKey,
  type Ref,
} from "vue";

export type TaskPinStore = Readonly<{
  pinnedTaskIds: DeepReadonly<Ref<ReadonlySet<string>>>;
  isPinned(taskId: string): boolean;
  toggle(taskId: string): boolean;
  remove(taskId: string): void;
}>;

export function createTaskPinStore(initialTaskIds: Iterable<string> = []): TaskPinStore {
  const pinnedTaskIds = shallowRef<ReadonlySet<string>>(new Set(initialTaskIds));

  return {
    pinnedTaskIds: readonly(pinnedTaskIds),
    isPinned: (taskId) => pinnedTaskIds.value.has(taskId),
    toggle: (taskId) => {
      const next = new Set(pinnedTaskIds.value);
      const pinned = !next.has(taskId);
      if (pinned) {
        next.add(taskId);
      } else {
        next.delete(taskId);
      }
      pinnedTaskIds.value = next;
      return pinned;
    },
    remove: (taskId) => {
      if (!pinnedTaskIds.value.has(taskId)) return;
      const next = new Set(pinnedTaskIds.value);
      next.delete(taskId);
      pinnedTaskIds.value = next;
    },
  };
}

export const taskPinStoreKey: InjectionKey<TaskPinStore> = Symbol("task-pin-store");
export const desktopTaskPinStore = createTaskPinStore();
