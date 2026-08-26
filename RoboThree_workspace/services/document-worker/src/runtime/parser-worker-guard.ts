import Module from "node:module";

type ModuleLoader = (
  request: string,
  parent: NodeJS.Module | null | undefined,
  isMain: boolean,
) => unknown;

const BLOCKED_MODULES = new Set([
  "child_process",
  "node:child_process",
  "dgram",
  "node:dgram",
  "dns",
  "node:dns",
  "http",
  "node:http",
  "http2",
  "node:http2",
  "https",
  "node:https",
  "net",
  "node:net",
  "tls",
  "node:tls",
  "worker_threads",
  "node:worker_threads",
]);

export function installParserWorkerGuard(): void {
  installParserWorkerModuleGuard();
  installParserWorkerFetchGuard();
  installParserWorkerStdioGuard();
}

export function installParserWorkerModuleGuard(): void {
  const mutableModule = Module as typeof Module & {
    _load?: ModuleLoader;
  };
  const originalLoad = mutableModule._load;
  if (typeof originalLoad !== "function") {
    return;
  }

  mutableModule._load = function guardedModuleLoad(
    request: string,
    parent: NodeJS.Module | null | undefined,
    isMain: boolean,
  ): unknown {
    if (BLOCKED_MODULES.has(request)) {
      throw new Error(`PARSER_WORKER_MODULE_BLOCKED:${request}`);
    }
    return originalLoad.call(this, request, parent, isMain);
  };
}

export function installParserWorkerFetchGuard(): void {
  const blockedFetch = (): Promise<Response> => {
    throw new Error("PARSER_WORKER_NETWORK_BLOCKED:fetch");
  };
  globalThis.fetch = blockedFetch as typeof fetch;
}

export function installParserWorkerStdioGuard(): void {
  const blockedWrite = (): boolean => {
    throw new Error("PARSER_WORKER_STDIO_BLOCKED");
  };
  process.stdout.write = blockedWrite as typeof process.stdout.write;
  process.stderr.write = blockedWrite as typeof process.stderr.write;
}
