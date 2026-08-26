export type OperatingSystemTimezoneFact = Readonly<{
  timezone: string;
  sourceRevision: string;
}>;

/** Core-runtime timezone authority. It must return a validated IANA zone. */
export interface OperatingSystemTimezoneSource {
  requireCurrent(): OperatingSystemTimezoneFact;
}

