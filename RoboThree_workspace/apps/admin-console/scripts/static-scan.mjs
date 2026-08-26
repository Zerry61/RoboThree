import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoots = ['src', 'tests'].map((entry) => path.join(root, entry));
const positiveRoot = path.join(root, 'fixtures/static-scan/positive');
const negativeRoot = path.join(root, 'fixtures/static-scan/negative');
const pageRoot = path.join(root, 'src/pages');

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

async function scanFile(file) {
  const text = await readFile(file, 'utf8');
  const normalized = [...allowlist].reduce((value, allowed) => value.replaceAll(allowed, ''), text);
  const sensitive = sensitivePatterns.filter((pattern) => pattern.test(normalized));
  const unsafe = unsafeDomPatterns.filter((pattern) => pattern.test(normalized));
  const forbiddenSource = forbiddenSourcePatterns.filter((pattern) => pattern.test(normalized));
  return {
    file,
    sensitiveCount: sensitive.length,
    unsafeCount: unsafe.length,
    forbiddenSourceCount: forbiddenSource.length
  };
}

async function scanForbiddenPageText() {
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

export async function scanStaticSources() {
  const sourceFiles = (await Promise.all(sourceRoots.map(listFiles))).flat();
  const positiveFiles = await listFiles(positiveRoot);
  const negativeFiles = await listFiles(negativeRoot);

  const sourceScans = await Promise.all(sourceFiles.map(scanFile));
  const positiveScans = await Promise.all(positiveFiles.map(scanFile));
  const negativeScans = await Promise.all(negativeFiles.map(scanFile));
  const pageTextViolations = await scanForbiddenPageText();

  return {
    sourceViolations: sourceScans.filter(
      (scan) => scan.sensitiveCount > 0 || scan.unsafeCount > 0 || scan.forbiddenSourceCount > 0
    ),
    positiveDetections: positiveScans.filter(
      (scan) => scan.sensitiveCount > 0 || scan.unsafeCount > 0 || scan.forbiddenSourceCount > 0
    ),
    negativeFalsePositives: negativeScans.filter(
      (scan) => scan.sensitiveCount > 0 || scan.unsafeCount > 0 || scan.forbiddenSourceCount > 0
    ),
    pageTextViolations
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await scanStaticSources();
  console.log(JSON.stringify(result, null, 2));
  if (
    result.sourceViolations.length > 0 ||
    result.positiveDetections.length === 0 ||
    result.negativeFalsePositives.length > 0 ||
    result.pageTextViolations.length > 0
  ) {
    process.exit(1);
  }
}
