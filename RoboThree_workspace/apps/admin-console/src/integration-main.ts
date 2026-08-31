import Vue from 'vue';
import App from './app/App.vue';
import { createRouter } from './app/router';
import { installAdminAdapter } from './app/admin-runtime';
import { permissionProjectionFromCapabilities } from './app/integration-bootstrap';
import { createAdminApiAdapter } from './adapters/admin-api-adapter';
import { createUnavailablePermissionProjection } from './app/permission-shell';
import './styles/tokens.css';
import './styles/base.css';

Vue.config.productionTip = false;

async function start(): Promise<void> {
  const adapter = createAdminApiAdapter();
  installAdminAdapter(adapter);
  let permissionProjection = createUnavailablePermissionProjection();
  try {
    permissionProjection = permissionProjectionFromCapabilities(await adapter.getCurrentCapabilities());
  } catch {
    // The integration shell remains mounted with no readable routes. It never falls back to fixtures.
  }
  new Vue({
    router: createRouter(permissionProjection),
    render: (createElement) => createElement(App, { props: { permissionProjection } })
  }).$mount('#app');
}

void start();
