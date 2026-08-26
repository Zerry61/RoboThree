import { performance } from "node:perf_hooks";

export type BenchmarkEnvironment = Readonly<{
  hardware: string;
  os: string;
  node: string;
  pnpm: string;
  sqlite: string;
  dataScale: Readonly<Record<string, number | string>>;
  parameters: Readonly<Record<string, number | string | boolean>>;
}>;

export type BenchmarkDefinition = Readonly<{
  name: string;
  category: string;
  warmupIterations: number;
  samples: number;
  iterationsPerSample: number;
  operation: () => void | Promise<void>;
}>;

export type BenchmarkMeasurement = Readonly<{
  name: string;
  category: string;
  samples: number;
  iterationsPerSample: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  minMs: number;
  maxMs: number;
  operationsPerSecond: number;
}>;

export type BenchmarkReport = Readonly<{
  schemaVersion: "robothree.performance.v1";
  generatedAt: string;
  environment: BenchmarkEnvironment;
  measurements: readonly BenchmarkMeasurement[];
}>;

export class PerformanceHarness {
  readonly #environment: BenchmarkEnvironment;
  readonly #now: () => number;
  readonly #generatedAt: () => string;
  readonly #definitions: BenchmarkDefinition[] = [];

  public constructor(input: {
    environment: BenchmarkEnvironment;
    monotonicNow?: () => number;
    generatedAt?: () => string;
  }) {
    this.#environment = input.environment;
    this.#now = input.monotonicNow ?? (() => performance.now());
    this.#generatedAt = input.generatedAt ?? (() => new Date().toISOString());
  }

  public add(definition: BenchmarkDefinition): void {
    validateDefinition(definition);
    if (this.#definitions.some((candidate) => candidate.name === definition.name)) {
      throw new Error(`benchmark ${definition.name} already exists`);
    }
    this.#definitions.push(definition);
  }

  public async run(): Promise<BenchmarkReport> {
    const measurements: BenchmarkMeasurement[] = [];
    for (const definition of this.#definitions) {
      for (let index = 0; index < definition.warmupIterations; index += 1) {
        await definition.operation();
      }
      const durations: number[] = [];
      for (let sample = 0; sample < definition.samples; sample += 1) {
        const startedAt = this.#now();
        for (let iteration = 0; iteration < definition.iterationsPerSample; iteration += 1) {
          await definition.operation();
        }
        const elapsed = this.#now() - startedAt;
        if (!Number.isFinite(elapsed) || elapsed < 0) {
          throw new Error(`benchmark ${definition.name} produced an invalid duration`);
        }
        durations.push(elapsed / definition.iterationsPerSample);
      }
      const sorted = [...durations].sort((left, right) => left - right);
      const totalMs = durations.reduce((sum, duration) => sum + duration, 0);
      measurements.push(Object.freeze({
        name: definition.name,
        category: definition.category,
        samples: definition.samples,
        iterationsPerSample: definition.iterationsPerSample,
        p50Ms: percentile(sorted, 0.50),
        p95Ms: percentile(sorted, 0.95),
        p99Ms: percentile(sorted, 0.99),
        minMs: sorted[0]!,
        maxMs: sorted.at(-1)!,
        operationsPerSecond: totalMs === 0
          ? Number.POSITIVE_INFINITY
          : (definition.samples * 1_000) / totalMs,
      }));
    }
    return Object.freeze({
      schemaVersion: "robothree.performance.v1",
      generatedAt: this.#generatedAt(),
      environment: this.#environment,
      measurements: Object.freeze(measurements),
    });
  }
}

export function formatBenchmarkMarkdown(report: BenchmarkReport): string {
  const lines = [
    "# RoboThree Performance Report",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    "## Environment",
    "",
    `- Hardware: ${report.environment.hardware}`,
    `- OS: ${report.environment.os}`,
    `- Node: ${report.environment.node}`,
    `- pnpm: ${report.environment.pnpm}`,
    `- SQLite: ${report.environment.sqlite}`,
    `- Data scale: \`${JSON.stringify(report.environment.dataScale)}\``,
    `- Parameters: \`${JSON.stringify(report.environment.parameters)}\``,
    "",
    "## Measurements",
    "",
    "| Benchmark | Category | Samples | Iterations/sample | P50 ms | P95 ms | P99 ms | Ops/s |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...report.measurements.map((measurement) => (
      `| ${measurement.name} | ${measurement.category} | ${measurement.samples} | ${measurement.iterationsPerSample} | ${formatNumber(measurement.p50Ms)} | ${formatNumber(measurement.p95Ms)} | ${formatNumber(measurement.p99Ms)} | ${formatNumber(measurement.operationsPerSecond)} |`
    )),
    "",
  ];
  return lines.join("\n");
}

function validateDefinition(definition: BenchmarkDefinition): void {
  if (definition.name.length === 0 || definition.category.length === 0) {
    throw new Error("benchmark name and category cannot be empty");
  }
  requireNonNegativeInteger(definition.warmupIterations, "warmupIterations");
  requirePositiveInteger(definition.samples, "samples");
  requirePositiveInteger(definition.iterationsPerSample, "iterationsPerSample");
}

function percentile(sorted: readonly number[], quantile: number): number {
  const index = Math.max(0, Math.ceil(sorted.length * quantile) - 1);
  return sorted[index]!;
}

function formatNumber(value: number): string {
  return Number.isFinite(value) ? value.toFixed(3) : "Infinity";
}

function requireNonNegativeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }
}

function requirePositiveInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
}
