import Vue from 'vue';
import App from './app/App.vue';
import { createRouter } from './app/router';
import { createUnavailablePermissionProjection } from './app/permission-shell';
import './styles/tokens.css';
import './styles/base.css';

Vue.config.productionTip = false;

const permissionProjection = createUnavailablePermissionProjection();

new Vue({
  router: createRouter(permissionProjection),
  render: (createElement) =>
    createElement(App, {
      props: {
        permissionProjection
      }
    })
}).$mount('#app');
