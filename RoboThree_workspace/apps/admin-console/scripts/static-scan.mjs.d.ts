export type StaticScanOptions = Readonly<{
  rootDir?: string;
  bundleRoots?: Readonly<{
    production: string;
    integration: string;
  }>;
}>;

export type StaticScanResult = Readonly<{
  sourceViolations: readonly Readonly<{
    file: string;
    sensitiveCount: number;
    unsafeCount: number;
    forbiddenSourceCount: number;
  }>[];
  bundleViolations: readonly Readonly<{
    file: string;
    sensitiveCount: number;
    unsafeCount: number;
    forbiddenSourceCount: number;
  }>[];
  productionBundleViolations: readonly Readonly<{
    file: string;
    forbiddenProductionBundleCount: number;
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
  bundleEvidence: readonly Readonly<{
    root: 'dist' | 'dist-integration';
    exists: boolean;
    scannedFileCount: number;
    jsFileCount: number;
  }>[];
  missingRequiredBundleRoots: readonly ('dist' | 'dist-integration')[];
  emptyRequiredBundleRoots: readonly ('dist' | 'dist-integration')[];
}>;

export function scanStaticSources(options?: StaticScanOptions): Promise<StaticScanResult>;
export function hasStaticScanFailure(result: StaticScanResult): boolean;
