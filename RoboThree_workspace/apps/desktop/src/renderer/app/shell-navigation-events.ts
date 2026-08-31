const SHELL_NAVIGATION_CHANGED_EVENT = "robothree:shell-navigation-changed";
const WORKBENCH_NEW_TASK_REQUESTED_EVENT = "robothree:workbench-new-task-requested";

export function notifyShellNavigationChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(SHELL_NAVIGATION_CHANGED_EVENT));
}

export function subscribeShellNavigationChanged(listener: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(SHELL_NAVIGATION_CHANGED_EVENT, listener);
  return () => window.removeEventListener(SHELL_NAVIGATION_CHANGED_EVENT, listener);
}

export function notifyWorkbenchNewTaskRequested(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(WORKBENCH_NEW_TASK_REQUESTED_EVENT));
}

export function subscribeWorkbenchNewTaskRequested(listener: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(WORKBENCH_NEW_TASK_REQUESTED_EVENT, listener);
  return () => window.removeEventListener(WORKBENCH_NEW_TASK_REQUESTED_EVENT, listener);
}
