import type { RuntimeError } from "@robothree/contracts";

export function desktopFoundationError(
  code: string,
  message: string,
  category: RuntimeError["category"] = "persistence",
  details?: Record<string, unknown>,
): RuntimeError {
  return {
    code,
    category,
    message,
    retryable: false,
    ...(details === undefined ? {} : { details }),
  };
}
