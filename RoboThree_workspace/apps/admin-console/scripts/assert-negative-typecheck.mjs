import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const tsconfig = JSON.parse(readFileSync('tsconfig.json', 'utf8'));
const negativeConfig = JSON.parse(readFileSync('tsconfig.negative.json', 'utf8'));

if (tsconfig.vueCompilerOptions?.target !== 2.7 || tsconfig.vueCompilerOptions?.strictTemplates !== true) {
  console.error('Expected tsconfig.json to enable Vue 2.7 strict template checking.');
  process.exit(1);
}

if (negativeConfig.extends !== './tsconfig.json') {
  console.error('Expected tsconfig.negative.json to inherit tsconfig.json.');
  process.exit(1);
}

const result = spawnSync('pnpm', ['exec', 'vue-tsc', '--noEmit', '-p', 'tsconfig.negative.json'], {
  cwd: process.cwd(),
  encoding: 'utf8'
});

const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
const expectedFiles = ['BadProps.vue', 'BadTemplateAccess.vue', 'bad-route-meta.ts'];
const foundFiles = expectedFiles.filter((file) => output.includes(file));
const expectedDiagnostics = ['Type', 'missingField', 'implementationGate'];
const foundDiagnostics = expectedDiagnostics.filter((diagnostic) => output.includes(diagnostic));

if (result.status === 0) {
  console.error('Expected negative typecheck to fail, but it exited 0.');
  process.exit(1);
}

if (foundFiles.length !== expectedFiles.length || foundDiagnostics.length < 2) {
  console.error('Negative typecheck failed, but expected Vue/TS diagnostics were not observed.');
  console.error(output);
  process.exit(1);
}

console.log('Negative typecheck failed as expected.');
console.log(`Observed files: ${foundFiles.join(', ')}`);
console.log(`Observed diagnostics: ${foundDiagnostics.join(', ')}`);
