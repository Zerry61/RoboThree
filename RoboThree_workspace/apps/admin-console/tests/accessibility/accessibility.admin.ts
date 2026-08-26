import Vue from 'vue';
import Router from 'vue-router';
import { mount, createLocalVue } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import AdminShell from '../../src/components/layout/AdminShell.vue';
import { adminNavigation, systemNavigation } from '../../src/app/navigation';
import { createPermissionProjection } from '../../src/app/permission-shell';
import type VueType from 'vue';
import type { VueConstructor } from 'vue';

const localVue = createLocalVue();
localVue.use(Router);

describe('Admin accessibility shell', () => {
  it('provides navigation landmarks, skip link, and main content target', () => {
    const router = new Router({
      mode: 'hash',
      routes: [
        {
          path: '/system/users',
          component: Vue.extend({ template: '<section />' }),
          meta: {
            navKey: 'system',
            systemSubKey: 'users',
            pageTitle: '用户与权限'
          }
        }
      ]
    });
    router.push('/system/users').catch(() => undefined);

    const wrapper = mount(AdminShell as unknown as VueConstructor<VueType>, {
      localVue,
      router,
      propsData: {
        permissionProjection: createPermissionProjection({
          authenticated: true,
          visibleMenuAliases: [
            adminNavigation[5].menuPermissionAlias,
            ...systemNavigation.map((item) => item.menuPermissionAlias)
          ]
        })
      }
    });

    expect(wrapper.find('.skip-link').attributes('href')).toBe('#admin-main');
    expect(wrapper.find('nav[aria-label="一级导航"]').exists()).toBe(true);
    expect(wrapper.find('nav[aria-label="系统管理二级导航"]').exists()).toBe(true);
    expect(wrapper.find('#admin-main').attributes('tabindex')).toBe('-1');
  });
});
