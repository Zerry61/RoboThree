import type { Server } from 'node:http';

export const ADMIN_INTEGRATION_HOST: '127.0.0.1';
export const ADMIN_INTEGRATION_PORT: 41731;
export const ADMIN_INTEGRATION_ORIGIN: 'http://127.0.0.1:41731';
export const ADMIN_SECURITY_HEADERS: Readonly<Record<string, string>>;
export function createAdminIntegrationServer(input: Readonly<{ staticRoot: string; centralOrigin: string }>): Server;
