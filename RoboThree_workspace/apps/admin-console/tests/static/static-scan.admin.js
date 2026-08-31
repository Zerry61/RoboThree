import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error The runtime ESM script keeps its reviewed declaration in static-scan.mjs.d.ts.
import * as staticScanRuntime from '../../scripts/static-scan.mjs';
import { createUnavailableAdminAdapter } from '../../src/adapters/unavailable-admin-adapter';
const { hasStaticScanFailure, scanStaticSources } = staticScanRuntime;
async function createBundleFixture(options = {}) {
    const root = await mkdtemp(path.join(tmpdir(), 'robothree-admin-static-scan-'));
    const production = path.join(root, 'dist');
    const integration = path.join(root, 'dist-integration');
    await createBundleRoot(production, options.production ?? 'valid');
    await createBundleRoot(integration, options.integration ?? 'valid');
    return {
        root,
        bundleRoots: {
            production,
            integration
        }
    };
}
async function createBundleRoot(directory, mode) {
    if (mode === 'missing') {
        return;
    }
    await mkdir(path.join(directory, 'assets'), { recursive: true });
    if (mode === 'empty') {
        return;
    }
    await writeFile(path.join(directory, 'index.html'), '<div id="app"></div>', 'utf8');
    await writeFile(path.join(directory, 'assets', 'app.css'), '.admin-shell{min-width:0}', 'utf8');
    if (mode === 'valid') {
        await writeFile(path.join(directory, 'assets', 'app.js'), 'const adminEvidence = "safe";', 'utf8');
    }
}
describe('Admin static boundaries', () => {
    it('keeps production source free of sensitive values and unsafe runtime access', async () => {
        const fixture = await createBundleFixture();
        try {
            const result = await scanStaticSources({ bundleRoots: fixture.bundleRoots });
            const productionEvidence = result.bundleEvidence.find((entry) => entry.root === 'dist');
            const integrationEvidence = result.bundleEvidence.find((entry) => entry.root === 'dist-integration');
            expect(result.sourceViolations).toEqual([]);
            expect(result.bundleViolations).toEqual([]);
            expect(result.productionBundleViolations).toEqual([]);
            expect(result.positiveDetections.length).toBeGreaterThan(0);
            expect(result.negativeFalsePositives).toEqual([]);
            expect(result.pageTextViolations).toEqual([]);
            expect(result.missingRequiredBundleRoots).toEqual([]);
            expect(result.emptyRequiredBundleRoots).toEqual([]);
            expect(productionEvidence?.exists).toBe(true);
            expect(productionEvidence?.scannedFileCount).toBeGreaterThan(0);
            expect(productionEvidence?.jsFileCount).toBeGreaterThan(0);
            expect(integrationEvidence?.exists).toBe(true);
            expect(integrationEvidence?.scannedFileCount).toBeGreaterThan(0);
            expect(integrationEvidence?.jsFileCount).toBeGreaterThan(0);
            expect(hasStaticScanFailure(result)).toBe(false);
        }
        finally {
            await rm(fixture.root, { recursive: true, force: true });
        }
    });
    it('fails when the production bundle root is missing', async () => {
        const fixture = await createBundleFixture({ production: 'missing' });
        try {
            const result = await scanStaticSources({ bundleRoots: fixture.bundleRoots });
            expect(result.missingRequiredBundleRoots).toContain('dist');
            expect(hasStaticScanFailure(result)).toBe(true);
        }
        finally {
            await rm(fixture.root, { recursive: true, force: true });
        }
    });
    it('fails when the integration bundle root is missing', async () => {
        const fixture = await createBundleFixture({ integration: 'missing' });
        try {
            const result = await scanStaticSources({ bundleRoots: fixture.bundleRoots });
            expect(result.missingRequiredBundleRoots).toContain('dist-integration');
            expect(hasStaticScanFailure(result)).toBe(true);
        }
        finally {
            await rm(fixture.root, { recursive: true, force: true });
        }
    });
    it('fails when required bundle roots are empty', async () => {
        const fixture = await createBundleFixture({ production: 'empty', integration: 'empty' });
        try {
            const result = await scanStaticSources({ bundleRoots: fixture.bundleRoots });
            expect(result.emptyRequiredBundleRoots).toEqual(expect.arrayContaining(['dist', 'dist-integration']));
            expect(hasStaticScanFailure(result)).toBe(true);
        }
        finally {
            await rm(fixture.root, { recursive: true, force: true });
        }
    });
    it('fails when a required bundle root has no JavaScript bundle', async () => {
        const fixture = await createBundleFixture({ production: 'cssOnly' });
        try {
            const result = await scanStaticSources({ bundleRoots: fixture.bundleRoots });
            const productionEvidence = result.bundleEvidence.find((entry) => entry.root === 'dist');
            expect(productionEvidence?.exists).toBe(true);
            expect(productionEvidence?.scannedFileCount).toBeGreaterThan(0);
            expect(productionEvidence?.jsFileCount).toBe(0);
            expect(hasStaticScanFailure(result)).toBe(true);
        }
        finally {
            await rm(fixture.root, { recursive: true, force: true });
        }
    });
    it('uses unavailable adapter as the production-safe default behavior', async () => {
        const adapter = createUnavailableAdminAdapter();
        await expect(adapter.getCurrentCapabilities()).rejects.toThrow('admin.integration_unavailable');
    });
});
