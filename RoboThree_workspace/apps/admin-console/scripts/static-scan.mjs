import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultBundleRootNames = {
  production: 'dist',
  integration: 'dist-integration'
};

const allowlist = new Set([
  'fixture-api-key-do-not-use',
  'prototype/gated',
  'fake_model_alpha',
  'admintest_aapi02_fixed_sentinel'
]);

const sensitivePatterns = [
  /Bearer\s+[A-Za-z0-9._~-]{24,}/,
  /sk-[A-Za-z0-9_-]{20,}/,
  /-----BEGIN (?:RSA |EC |OPENSSH |)PRIVATE KEY-----/,
  /at\s+\w+\s+\(\/Users\/[^)]+:\d+:\d+\)/,
  /\/Users\/[A-Za-z0-9._-]+\/(?:Desktop|Library|Documents)\//,
  /\bcredentialRef\s*[:=]\s*['"][^'"]{6,}['"]/i,
  /\bcredentialReference\s*[:=]\s*['"][^'"]{6,}['"]/i,
  /\bendpoint\s*[:=]\s*['"]https?:\/\/[^'"]+['"]/i,
  /\brequestDigest\s*[:=]\s*['"][A-Za-z0-9._:-]{12,}['"]/i,
  /\bCapabilityLock\b/
];

const unsafeDomPatterns = [
  /\binnerHTML\b/,
  /\bv-html\b/,
  /\beval\s*\(/,
  /\bnew Function\s*\(/
];

const forbiddenPageText = ['Provider', 'API Key', 'Credential Reference', 'Endpoint', 'Token'];

const forbiddenSourcePatterns = [
  /from\s+['"][^'"]*apps\/desktop/,
  /from\s+['"]@vue\/runtime-dom['"]/,
  /from\s+['"]@vitejs\/plugin-vue['"]/,
  /\bfetch\s*\(/,
  /from\s+['"][^'"]*fixture-admin-adapter['"]/
];

const forbiddenProductionBundlePatterns = [
  /\bAdminApiAdapter\b/,
  /\bcreateAdminApiAdapter\b/,
  /\/admin\/v1alpha1/
];

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const next = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        return listFiles(next);
      }
      return next;
    })
  );
  return files.flat();
}

async function listExistingFiles(directory) {
  try {
    const current = await stat(directory);
    if (!current.isDirectory()) {
      return [];
    }
    return listFiles(directory);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

function resolveFromRoot(scanRoot, entry) {
  return path.isAbsolute(entry) ? entry : path.join(scanRoot, entry);
}

function resolveScanPaths(options = {}) {
  const scanRoot = options.rootDir ? path.resolve(options.rootDir) : root;
  const bundleRootOptions = options.bundleRoots ?? defaultBundleRootNames;

  return {
    sourceRoots: ['src', 'tests'].map((entry) => path.join(scanRoot, entry)),
    bundleRoots: [
      {
        root: 'dist',
        directory: resolveFromRoot(scanRoot, bundleRootOptions.production)
      },
      {
        root: 'dist-integration',
        directory: resolveFromRoot(scanRoot, bundleRootOptions.integration)
      }
    ],
    positiveRoot: path.join(scanRoot, 'fixtures/static-scan/positive'),
    negativeRoot: path.join(scanRoot, 'fixtures/static-scan/negative'),
    pageRoot: path.join(scanRoot, 'src/pages')
  };
}

function isScannableBundleFile(file) {
  return /\.(?:css|html|js|mjs)$/.test(file);
}

async function scanFile(file, options = {}) {
  const includeUnsafe = options.includeUnsafe ?? true;
  const includeForbiddenSource = options.includeForbiddenSource ?? true;
  const text = await readFile(file, 'utf8');
  const normalized = [...allowlist].reduce((value, allowed) => value.replaceAll(allowed, ''), text);
  const sensitive = sensitivePatterns.filter((pattern) => pattern.test(normalized));
  const unsafe = includeUnsafe ? unsafeDomPatterns.filter((pattern) => pattern.test(normalized)) : [];
  const forbiddenSource = includeForbiddenSource ? forbiddenSourcePatterns.filter((pattern) => pattern.test(normalized)) : [];
  return {
    file,
    sensitiveCount: sensitive.length,
    unsafeCount: unsafe.length,
    forbiddenSourceCount: forbiddenSource.length
  };
}

async function scanBundleBoundary(file) {
  const text = await readFile(file, 'utf8');
  const found = forbiddenProductionBundlePatterns.filter((pattern) => pattern.test(text));
  return {
    file,
    forbiddenProductionBundleCount: found.length
  };
}

async function scanBundleRoot(bundleRoot) {
  const files = await listExistingFiles(bundleRoot.directory);
  const scannableFiles = files.filter(isScannableBundleFile);
  const jsFiles = scannableFiles.filter((file) => /\.(?:js|mjs)$/.test(file));
  const exists = files.length > 0 || (await stat(bundleRoot.directory).then(
    (current) => current.isDirectory(),
    (error) => {
      if (error?.code === 'ENOENT') {
        return false;
      }
      throw error;
    }
  ));

  return {
    root: bundleRoot.root,
    files: scannableFiles,
    evidence: {
      root: bundleRoot.root,
      exists,
      scannedFileCount: scannableFiles.length,
      jsFileCount: jsFiles.length
    }
  };
}

async function scanForbiddenPageText(pageRoot) {
  const files = await listFiles(pageRoot);
  const scans = await Promise.all(
    files.map(async (file) => {
      const text = await readFile(file, 'utf8');
      const found = forbiddenPageText.filter((value) => text.includes(value));
      return {
        file,
        found
      };
    })
  );
  return scans.filter((scan) => scan.found.length > 0);
}

export async function scanStaticSources(options = {}) {
  const scanPaths = resolveScanPaths(options);
  const sourceFiles = (await Promise.all(scanPaths.sourceRoots.map(listFiles))).flat();
  const bundleRootScans = await Promise.all(scanPaths.bundleRoots.map(scanBundleRoot));
  const bundleFiles = bundleRootScans.flatMap((scan) => scan.files);
  const positiveFiles = await listFiles(scanPaths.positiveRoot);
  const negativeFiles = await listFiles(scanPaths.negativeRoot);

  const sourceScans = await Promise.all(sourceFiles.map(scanFile));
  const bundleScans = await Promise.all(bundleFiles.map((file) => scanFile(file, { includeUnsafe: false, includeForbiddenSource: false })));
  const productionBundleFiles = bundleRootScans
    .filter((scan) => scan.root === 'dist')
    .flatMap((scan) => scan.files);
  const productionBundleScans = await Promise.all(productionBundleFiles.map(scanBundleBoundary));
  const positiveScans = await Promise.all(positiveFiles.map(scanFile));
  const negativeScans = await Promise.all(negativeFiles.map(scanFile));
  const pageTextViolations = await scanForbiddenPageText(scanPaths.pageRoot);
  const bundleEvidence = bundleRootScans.map((scan) => scan.evidence);

  return {
    sourceViolations: sourceScans.filter(
      (scan) => scan.sensitiveCount > 0 || scan.unsafeCount > 0 || scan.forbiddenSourceCount > 0
    ),
    bundleViolations: bundleScans.filter(
      (scan) => scan.sensitiveCount > 0 || scan.unsafeCount > 0 || scan.forbiddenSourceCount > 0
    ),
    productionBundleViolations: productionBundleScans.filter(
      (scan) => scan.forbiddenProductionBundleCount > 0
    ),
    positiveDetections: positiveScans.filter(
      (scan) => scan.sensitiveCount > 0 || scan.unsafeCount > 0 || scan.forbiddenSourceCount > 0
    ),
    negativeFalsePositives: negativeScans.filter(
      (scan) => scan.sensitiveCount > 0 || scan.unsafeCount > 0 || scan.forbiddenSourceCount > 0
    ),
    pageTextViolations,
    bundleEvidence,
    missingRequiredBundleRoots: bundleEvidence.filter((entry) => !entry.exists).map((entry) => entry.root),
    emptyRequiredBundleRoots: bundleEvidence
      .filter((entry) => entry.exists && entry.scannedFileCount === 0)
      .map((entry) => entry.root)
  };
}

export function hasStaticScanFailure(result) {
  return (
    result.sourceViolations.length > 0 ||
    result.bundleViolations.length > 0 ||
    result.productionBundleViolations.length > 0 ||
    result.positiveDetections.length === 0 ||
    result.negativeFalsePositives.length > 0 ||
    result.pageTextViolations.length > 0 ||
    result.missingRequiredBundleRoots.length > 0 ||
    result.emptyRequiredBundleRoots.length > 0 ||
    result.bundleEvidence.some((entry) => entry.jsFileCount === 0)
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await scanStaticSources();
  console.log(JSON.stringify(result, null, 2));
  if (hasStaticScanFailure(result)) {
    process.exit(1);
  }
}
