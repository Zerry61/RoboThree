import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { createUnavailableAdminAdapter } from '../../src/adapters/unavailable-admin-adapter';

describe('Admin static boundaries', () => {
  it('keeps production source free of sensitive values and unsafe runtime access', async () => {
    const output = execFileSync('node', ['scripts/static-scan.mjs'], {
      cwd: process.cwd(),
      encoding: 'utf8'
    });
    const result = JSON.parse(output) as {
      sourceViolations: unknown[];
      positiveDetections: unknown[];
      negativeFalsePositives: unknown[];
      pageTextViolations: unknown[];
    };

    expect(result.sourceViolations).toEqual([]);
    expect(result.positiveDetections.length).toBeGreaterThan(0);
    expect(result.negativeFalsePositives).toEqual([]);
    expect(result.pageTextViolations).toEqual([]);
  });

  it('uses unavailable adapter as the production-safe default behavior', async () => {
    const adapter = createUnavailableAdminAdapter();
    const capability = await adapter.getCapability('admin.models');

    expect(capability.state).toBe('unavailable');
    expect(capability.safeReason).toBe('真实管理能力待接入');
  });
});
