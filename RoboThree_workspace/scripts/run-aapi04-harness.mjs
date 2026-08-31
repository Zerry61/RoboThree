import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const admin = join(root, 'apps', 'admin-console');
const artifactDirectory = join(root, 'artifacts', 'aapi04');
const commands = [
  ['pnpm', ['--filter', '@robothree/admin-console', 'typecheck'], root],
  ['pnpm', ['--filter', '@robothree/admin-console', 'build'], root],
  ['pnpm', ['--filter', '@robothree/admin-console', 'build:integration'], root],
  ['pnpm', ['--filter', '@robothree/admin-console', 'test'], root],
  ['./mvnw', ['-q', '-Dtest=com.robothree.central.admincontrol.adapter.http.AdminBrowserIntegrationE2E', 'test'], join(root, 'services', 'central-service')]
];

await mkdir(artifactDirectory, { recursive: true });
try {
  for (const [command, args, cwd] of commands) {
    const result = spawnSync(command, args, {
      cwd,
      encoding: 'utf8',
      env: { ...process.env, CI: 'true', VITEST_MAX_WORKERS: '1', ROBOTHREE_WORKSPACE_ROOT: root },
      maxBuffer: 64 * 1024 * 1024
    });
    process.stdout.write(sanitize(result.stdout ?? ''));
    process.stderr.write(sanitize(result.stderr ?? ''));
    if (result.status !== 0) throw new Error('aapi04_focused_gate_failed');
  }
  const productionBundle = await readBundle(join(admin, 'dist'));
  const integrationBundle = await readBundle(join(admin, 'dist-integration'));
  if (productionBundle.includes('/admin/v1alpha1') || productionBundle.includes('X-RoboThree-Contract-Version')) {
    throw new Error('aapi04_production_adapter_reachable');
  }
  if (!integrationBundle.includes('/admin/v1alpha1') || !integrationBundle.includes('X-RoboThree-Contract-Version')) {
    throw new Error('aapi04_integration_adapter_missing');
  }
  const base = {
    schemaVersion: 'v1',
    status: 'PASS',
    outcome: 'AAPI04_DEVELOPMENT_TEST_ADMIN_READ_INTEGRATION_CONFORMANT',
    exactAdapterMethodCount: 12,
    mutationMethodCount: 0,
    productionAdminApiAdapterReachable: false,
    productionIdentityReady: false,
    productionAdminReadHttpReady: false,
    browserSecurityProductionReady: false,
    adminMutationReady: false,
    tgmReady: false,
    knowledgeProviderReady: false,
    agentLifecycleReady: false,
    integrationTopology: 'vite_build_node_loopback_proxy_central_ephemeral'
  };
  const evidence = { ...base, evidenceDigest: `sha256:${createHash('sha256').update(JSON.stringify(base)).digest('hex')}` };
  await writeFile(join(artifactDirectory, 'evidence.json'), JSON.stringify(evidence), 'utf8');
  process.stdout.write(`${JSON.stringify(evidence)}\n`);
} catch (error) {
  const failure = { status: 'FAIL', code: error instanceof Error ? error.message : 'aapi04_unexpected_failure' };
  await writeFile(join(artifactDirectory, 'failure.json'), JSON.stringify(failure), 'utf8');
  process.stderr.write(`${failure.code}\n`);
  process.exitCode = 1;
}

async function readBundle(directory) {
  const assets = join(directory, 'assets');
  const names = (await readdir(assets)).filter((name) => name.endsWith('.js')).sort();
  return (await Promise.all(names.map((name) => readFile(join(assets, name), 'utf8')))).join('\n');
}

function sanitize(value) {
  return value.split(root).join('<workspace>');
}
