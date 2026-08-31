import type { AdminAdapter } from '../adapters/admin-adapter';
import { createUnavailableAdminAdapter } from '../adapters/unavailable-admin-adapter';

let adapter: AdminAdapter = createUnavailableAdminAdapter();

export function installAdminAdapter(value: AdminAdapter): void {
  adapter = value;
}

export function getAdminAdapter(): AdminAdapter {
  return adapter;
}
