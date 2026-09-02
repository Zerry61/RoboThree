import Vue from 'vue';
import App from './app/App.vue';
import { createRouter, routes } from './app/router';
import { createPermissionProjection } from './app/permission-shell';
import { adminNavigation, systemNavigation } from './app/navigation';
import { installAdminAdapter } from './app/admin-runtime';
import { createUnavailableAdminAdapter } from './adapters/unavailable-admin-adapter';
import './styles/tokens.css';
import './styles/base.css';

Vue.config.productionTip = false;

const permissionProjection = createPermissionProjection({
  authenticated: true,
  visibleMenuAliases: [
    ...adminNavigation.map((item) => item.menuPermissionAlias),
    ...systemNavigation.map((item) => item.menuPermissionAlias)
  ],
  routeAliases: routes.flatMap((route) => route.meta.routePermissionAlias === undefined ? [] : [route.meta.routePermissionAlias]),
  operationAliases: routes.flatMap((route) => route.meta.operationPermissionAlias === undefined ? [] : [route.meta.operationPermissionAlias])
});

installAdminAdapter(createUnavailableAdminAdapter());

new Vue({
  router: createRouter(permissionProjection),
  render: (createElement) =>
    createElement(App, {
      props: {
        permissionProjection
      }
    })
}).$mount('#app');
