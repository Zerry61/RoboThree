import Vue from 'vue';
import Router from 'vue-router';
import { mount, createLocalVue } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import AdminShell from '../../src/components/layout/AdminShell.vue';
import PageState from '../../src/components/state/PageState.vue';
import { adminNavigation, systemNavigation } from '../../src/app/navigation';
import { createPermissionProjection } from '../../src/app/permission-shell';
import type { AdminPageStatus } from '../../src/adapters/admin-adapter';
import type VueType from 'vue';
import type { VueConstructor } from 'vue';

const localVue = createLocalVue();
localVue.use(Router);

function createShellRouter(path: string, meta: Record<string, unknown>): Router {
  const router = new Router({
    mode: 'hash',
    routes: [
      {
        path,
        component: Vue.extend({ template: '<main />' }),
        meta
      }
    ]
  });
  router.push(path).catch(() => undefined);
  return router;
}

describe('Admin shell components', () => {
  it('renders the six primary navigation entries when menu permissions are visible', () => {
    const projection = createPermissionProjection({
      authenticated: true,
      visibleMenuAliases: [
        ...adminNavigation.map((item) => item.menuPermissionAlias),
        ...systemNavigation.map((item) => item.menuPermissionAlias)
      ]
    });
    const router = createShellRouter('/models', {
      navKey: 'models',
      pageTitle: '模型管理'
    });

    const wrapper = mount(AdminShell as unknown as VueConstructor<VueType>, {
      localVue,
      router,
      propsData: {
        permissionProjection: projection
      },
      slots: {
        default: '<section>content</section>'
      }
    });

    expect(wrapper.findAll('.primary-nav__item')).toHaveLength(6);
    expect(wrapper.text()).toContain('模型管理');
    expect(wrapper.text()).toContain('系统管理');
  });

  it('renders system secondary navigation only inside the system module', () => {
    const projection = createPermissionProjection({
      authenticated: true,
      visibleMenuAliases: [
        adminNavigation[5].menuPermissionAlias,
        ...systemNavigation.map((item) => item.menuPermissionAlias)
      ]
    });
    const router = createShellRouter('/system/users', {
      navKey: 'system',
      systemSubKey: 'users',
      pageTitle: '用户与权限'
    });

    const wrapper = mount(AdminShell as unknown as VueConstructor<VueType>, {
      localVue,
      router,
      propsData: {
        permissionProjection: projection
      }
    });

    expect(wrapper.findAll('.system-sub-nav__item')).toHaveLength(3);
    expect(wrapper.text()).toContain('审计日志');
    expect(wrapper.text()).toContain('反馈管理');
  });

  it('covers all page states with stable safe text', () => {
    const statuses: readonly AdminPageStatus[] = [
      'loading',
      'empty',
      'ready',
      'unavailable',
      'permissionDenied',
      'notFound',
      'stale',
      'error',
      'disabled',
      'partial',
      'gated'
    ];

    for (const status of statuses) {
      const wrapper = mount(PageState as unknown as VueConstructor<VueType>, {
        propsData: {
          status
        }
      });
      expect(wrapper.text()).not.toContain('undefined');
      if (status === 'loading') {
        expect(wrapper.attributes('aria-busy')).toBe('true');
      } else {
        expect(wrapper.attributes('aria-busy')).not.toBe('true');
      }
    }
  });
});
