import Vue from 'vue';
import Router from 'vue-router';
import { mount, createLocalVue } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import AdminShell from '../../src/components/layout/AdminShell.vue';
import ModelsPage from '../../src/pages/models/ModelsPage.vue';
import ModelDetailPage from '../../src/pages/models/ModelDetailPage.vue';
import { adminNavigation, systemNavigation } from '../../src/app/navigation';
import { installAdminAdapter } from '../../src/app/admin-runtime';
import { createPermissionProjection } from '../../src/app/permission-shell';
import { createUnavailableAdminAdapter } from '../../src/adapters/unavailable-admin-adapter';
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
        const wrapper = mount(AdminShell, {
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
        expect(wrapper.find('.system-sub-nav__item[aria-current="page"]').text()).toBe('用户与权限');
    });
    it('keeps list and detail pages keyboard-addressable with readable link names', async () => {
        installModelAdapter();
        const list = mount(ModelsPage);
        await flushAsync();
        const detailLink = list.find('a[href="#/models/model.long-name"]');
        expect(detailLink.exists()).toBe(true);
        expect(detailLink.attributes('aria-label')).toBe('查看企业通用模型超长名称用于换行证据详情');
        expect(list.find('table caption').text()).toBe('企业模型');
        expect(list.findAll('th[scope="col"]')).toHaveLength(5);
        const detail = mount(ModelDetailPage, {
            mocks: { $route: { params: { modelId: 'model.long-name' } } }
        });
        await flushAsync();
        expect(detail.find('.inventory-back-link').attributes('href')).toBe('#/models');
        expect(detail.find('.inventory-back-link').text()).toBe('返回模型管理');
        expect(detail.findAll('h3').wrappers.map((heading) => heading.text())).toEqual(['模型配置']);
    });
    it('keeps focusable controls discoverable with programmatic focus evidence', async () => {
        installModelAdapter({
            async listManagedModels() { return managedModelPage([model]); }
        });
        const wrapper = mount(ModelsPage, {
            attachTo: document.body
        });
        await flushAsync();
        const link = wrapper.find('a[href="#/models/model.long-name"]').element;
        link.focus();
        expect(document.activeElement).toBe(link);
        const createLink = wrapper.find('a[aria-label="添加企业模型"]').element;
        createLink.focus();
        expect(document.activeElement).toBe(createLink);
        wrapper.destroy();
    });
});
async function flushAsync() {
    await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
}
function installModelAdapter(overrides = {}) {
    installAdminAdapter({
        ...createUnavailableAdminAdapter(),
        async listManagedModels() { return managedModelPage([model]); },
        async getManagedModel() { return model; },
        ...overrides
    });
}
const revision = `sha256:${'c'.repeat(64)}`;
function managedModelPage(items) {
    return { contractVersion: 'admin-control.v1alpha2', queryRevision: revision, items };
}
const model = {
    modelId: 'model.long-name',
    modelRevision: revision,
    displayName: '企业通用模型超长名称用于换行证据',
    providerFamily: 'openai_compatible',
    lifecycle: 'enabled',
    credentialStatus: 'configured',
    defaultForNewTasks: false,
    lastConnectionCheck: {
        status: 'success',
        durationMs: 88,
        testedAt: '2026-08-30T00:00:00.000Z',
        correlationId: '00000000-0000-4000-8000-000000000004'
    },
    endpoint: ['https://service.example.test', '/v1'].join(''),
    providerModelId: 'gpt-compatible'
};
