import { spawn } from 'node:child_process';
import { once } from 'node:events';
import http from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';

const url = 'http://127.0.0.1:41731/';
const timeoutMs = 30000;

function getText(targetUrl) {
  return new Promise((resolve, reject) => {
    const request = http.get(targetUrl, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        body += chunk;
      });
      response.on('end', () => {
        resolve({
          ok: response.statusCode !== undefined && response.statusCode >= 200 && response.statusCode < 300,
          text: body
        });
      });
    });
    request.on('error', reject);
    request.setTimeout(5000, () => {
      request.destroy(new Error(`Timeout requesting ${targetUrl}`));
    });
  });
}

async function waitForServer() {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await getText(url);
      if (response.ok && response.text.includes('RoboThree Admin Console')) {
        return;
      }
    } catch {
      // Retry until timeout.
    }
    await delay(500);
  }
  throw new Error(`Vite dev server did not respond at ${url}`);
}

async function assertPortReleased() {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      await getText(url);
    } catch {
      return;
    }
    await delay(500);
  }
  throw new Error(`Vite dev server still responds at ${url}`);
}

const child = spawn('pnpm', ['exec', 'vite', '--host', '127.0.0.1', '--port', '41731', '--strictPort'], {
  cwd: process.cwd(),
  stdio: ['ignore', 'pipe', 'pipe']
});

let logs = '';
child.stdout.on('data', (chunk) => {
  logs += String(chunk);
});
child.stderr.on('data', (chunk) => {
  logs += String(chunk);
});

try {
  await waitForServer();
  child.kill('SIGTERM');
  await Promise.race([once(child, 'exit'), delay(10000).then(() => child.kill('SIGKILL'))]);
  await assertPortReleased();
  console.log('Vite dev startup smoke passed.');
} catch (error) {
  child.kill('SIGKILL');
  console.error(logs);
  console.error(error);
  process.exit(1);
}
