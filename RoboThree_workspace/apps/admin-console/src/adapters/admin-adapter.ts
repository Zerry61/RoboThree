import type { CapabilityProjection } from '../app/route-meta';

export type AdminAdapter = Readonly<{
  getCapability(capabilityKey: string): Promise<CapabilityProjection>;
}>;

export type AdminPageStatus = 'loading' | 'empty' | 'ready' | 'unavailable' | 'permissionDenied' | 'error' | 'disabled' | 'partial';

export type SafeErrorSummary = Readonly<{
  title: string;
  message: string;
  correlationId?: string;
}>;
