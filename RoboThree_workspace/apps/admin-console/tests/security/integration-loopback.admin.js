import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { createServer, request as httpRequest } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ADMIN_SECURITY_HEADERS, createAdminIntegrationServer } from '../../scripts/integration-loopback-server.mjs';
const servers = [];
afterEach(async () => { await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(() => resolve())))); });
describe('Admin integration loopback server', () => {
    it('serves the integration build and proxies only exact same-origin Admin API methods with strict headers', async () => {
        const root = await mkdtemp(join(tmpdir(), 'r3-admin-security-'));
        await writeFile(join(root, 'integration.html'), '<!doctype html><title>integration</title>');
        await mkdir(join(root, 'assets'));
        await writeFile(join(root, 'assets', 'app.css'), 'body{min-width:0}');
        const upstreamRequests = [];
        const upstream = createServer((request, response) => {
            expect(request.headers.authorization).toBeUndefined();
            expect(request.headers.cookie).toBeUndefined();
            const chunks = [];
            request.on('data', (chunk) => chunks.push(chunk));
            request.on('end', () => {
                upstreamRequests.push({
                    method: request.method ?? '',
                    url: request.url ?? '',
                    body: Buffer.concat(chunks).toString('utf8')
                });
                response.writeHead(200, { 'content-type': 'application/json', etag: '"sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"' });
                response.end('{}');
            });
        });
        servers.push(upstream);
        await listen(upstream);
        const upstreamAddress = upstream.address();
        if (upstreamAddress === null || typeof upstreamAddress === 'string')
            throw new Error('upstream address unavailable');
        const proxy = createAdminIntegrationServer({ staticRoot: root, centralOrigin: `http://127.0.0.1:${upstreamAddress.port}` });
        servers.push(proxy);
        await listen(proxy);
        const proxyAddress = proxy.address();
        if (proxyAddress === null || typeof proxyAddress === 'string')
            throw new Error('proxy address unavailable');
        const origin = `http://127.0.0.1:${proxyAddress.port}`;
        const html = await requestHttp(origin, 'GET', { Origin: 'http://127.0.0.1:41731', 'Sec-Fetch-Site': 'same-origin' });
        expect(html.body).toContain('integration');
        for (const [name, value] of Object.entries(ADMIN_SECURITY_HEADERS))
            expect(html.headers[name.toLowerCase()]).toBe(value);
        const asset = await requestHttp(`${origin}/assets/app.css`, 'GET', { Origin: 'http://127.0.0.1:41731', 'Sec-Fetch-Site': 'same-origin' });
        expect(asset.body).toContain('min-width:0');
        expect((await requestHttp(`${origin}/models`, 'GET', { Origin: 'http://127.0.0.1:41731', 'Sec-Fetch-Site': 'same-origin' })).status).toBe(404);
        const api = await requestHttp(`${origin}/admin/v1alpha1/models`, 'GET', { Origin: 'http://127.0.0.1:41731', 'Sec-Fetch-Site': 'same-origin', Authorization: 'Bearer sentinel', Cookie: 'session=sentinel' });
        expect(api.status).toBe(200);
        expect(api.headers['access-control-allow-origin']).toBeUndefined();
        expect((await requestHttp(`${origin}/admin/v1alpha1/models`, 'POST', {
            Origin: 'http://127.0.0.1:41731',
            'Sec-Fetch-Site': 'same-origin',
            'Content-Type': 'application/json',
            'Content-Length': '2'
        }, '{}')).status).toBe(405);
        const command = JSON.stringify({ commandType: 'test_model_connection' });
        const mutation = await requestHttp(`${origin}/admin/v1alpha2/models/test-connection`, 'POST', {
            Origin: 'http://127.0.0.1:41731',
            'Sec-Fetch-Site': 'same-origin',
            'Content-Type': 'application/json',
            'Content-Length': String(Buffer.byteLength(command)),
            'X-RoboThree-Contract-Version': 'admin-control.v1alpha2',
            Authorization: 'Bearer sentinel',
            Cookie: 'session=sentinel'
        }, command);
        expect(mutation.status).toBe(200);
        expect(mutation.headers['access-control-allow-origin']).toBeUndefined();
        expect(upstreamRequests).toEqual([
            { method: 'GET', url: '/admin/v1alpha1/models', body: '' },
            { method: 'POST', url: '/admin/v1alpha2/models/test-connection', body: command }
        ]);
        expect((await requestHttp(origin, 'GET', { Origin: 'https://attacker.invalid' })).status).toBe(403);
        expect((await requestHttp(origin, 'POST')).status).toBe(405);
    });
});
async function listen(server) {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
}
async function requestHttp(url, method, headers = {}, body) {
    return new Promise((resolve, reject) => {
        const request = httpRequest(url, { method, headers }, (response) => {
            const chunks = [];
            response.on('data', (chunk) => chunks.push(chunk));
            response.on('end', () => resolve({ status: response.statusCode ?? 0, headers: response.headers, body: Buffer.concat(chunks).toString('utf8') }));
        });
        request.once('error', reject);
        request.end(body);
    });
}
