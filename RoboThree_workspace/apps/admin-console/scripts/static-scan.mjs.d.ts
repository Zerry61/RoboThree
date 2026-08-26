export type StaticScanResult = Readonly<{
  sourceViolations: readonly Readonly<{
    file: string;
    sensitiveCount: number;
    unsafeCount: number;
    forbiddenSourceCount: number;
  }>[];
  positiveDetections: readonly Readonly<{
    file: string;
    sensitiveCount: number;
    unsafeCount: number;
    forbiddenSourceCount: number;
  }>[];
  negativeFalsePositives: readonly Readonly<{
    file: string;
    sensitiveCount: number;
    unsafeCount: number;
    forbiddenSourceCount: number;
  }>[];
  pageTextViolations: readonly Readonly<{
    file: string;
    found: readonly string[];
  }>[];
}>;

export function scanStaticSources(): Promise<StaticScanResult>;
