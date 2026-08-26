import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ActionSummary from '../../src/components/ui/ActionSummary.vue';
import AdminButton from '../../src/components/ui/AdminButton.vue';
import AdminTable from '../../src/components/ui/AdminTable.vue';
import CheckboxShell from '../../src/components/ui/CheckboxShell.vue';
import ConfirmDialog from '../../src/components/ui/ConfirmDialog.vue';
import DrawerShell from '../../src/components/ui/DrawerShell.vue';
import FieldShell from '../../src/components/ui/FieldShell.vue';
import ModalShell from '../../src/components/ui/ModalShell.vue';
import OperationGate from '../../src/components/ui/OperationGate.vue';
import ReadonlyField from '../../src/components/ui/ReadonlyField.vue';
import SecretStatus from '../../src/components/ui/SecretStatus.vue';
import SelectShell from '../../src/components/ui/SelectShell.vue';
import TablePagination from '../../src/components/ui/TablePagination.vue';
import TextInput from '../../src/components/ui/TextInput.vue';
import type VueType from 'vue';
import type { VueConstructor } from 'vue';

const columns = [
  { key: 'name', label: '对象' },
  { key: 'state', label: '状态' }
] as const;

describe('Admin common components', () => {
  it('does not emit button actions while disabled or loading', async () => {
    const disabled = mount(AdminButton as unknown as VueConstructor<VueType>, {
      propsData: {
        disabled: true
      },
      slots: {
        default: '保存'
      }
    });

    await disabled.trigger('click');
    expect(disabled.emitted('click')).toBeUndefined();

    const loading = mount(AdminButton as unknown as VueConstructor<VueType>, {
      propsData: {
        loading: true
      },
      slots: {
        default: '处理中'
      }
    });

    await loading.trigger('click');
    expect(loading.emitted('click')).toBeUndefined();

    const active = mount(AdminButton as unknown as VueConstructor<VueType>, {
      slots: {
        default: '可执行'
      }
    });

    await active.trigger('click');
    expect(active.emitted('click')).toHaveLength(1);
  });

  it('renders secret status as enum-only display text', () => {
    const wrapper = mount(SecretStatus as unknown as VueConstructor<VueType>, {
      propsData: {
        status: 'configured'
      }
    });

    expect(wrapper.text()).toBe('已配置');
    expect(wrapper.text()).not.toContain('cred_');
  });

  it('keeps operation denial separate from menu and route assumptions', () => {
    const wrapper = mount(OperationGate as unknown as VueConstructor<VueType>, {
      propsData: {
        action: {
          allowed: false,
          disabledReason: '当前操作待接入'
        }
      },
      slots: {
        default: '<button>执行</button>'
      }
    });

    expect(wrapper.attributes('aria-disabled')).toBe('true');
    expect(wrapper.text()).toContain('当前操作待接入');
    expect(wrapper.text()).not.toContain('admin.');
  });

  it('renders table loading, empty and ready states without fake pagination success', () => {
    const loading = mount(AdminTable as unknown as VueConstructor<VueType>, {
      propsData: {
        columns,
        loading: true
      }
    });
    expect(loading.attributes('aria-busy')).toBe('true');
    expect(loading.find('.skeleton-block').exists()).toBe(true);

    const empty = mount(AdminTable as unknown as VueConstructor<VueType>, {
      propsData: {
        columns,
        empty: true
      }
    });
    expect(empty.text()).toContain('暂无数据');

    const ready = mount(AdminTable as unknown as VueConstructor<VueType>, {
      propsData: {
        columns,
        caption: '管理对象'
      },
      slots: {
        default: '<tr><td>fake_model_alpha</td><td>待接入</td></tr>'
      }
    });
    expect(ready.text()).toContain('fake_model_alpha');
  });

  it('disables pagination controls until real paging facts exist', async () => {
    const wrapper = mount(TablePagination as unknown as VueConstructor<VueType>, {
      propsData: {
        page: 1,
        pageSize: 20,
        total: 0
      }
    });

    const buttons = wrapper.findAll('button');
    expect(buttons.at(0).attributes('disabled')).toBe('disabled');
    expect(buttons.at(1).attributes('disabled')).toBe('disabled');
    await buttons.at(1).trigger('click');
    expect(wrapper.emitted('next')).toBeUndefined();
  });

  it('renders field, input, select, checkbox and readonly structures with safe text', async () => {
    const field = mount(FieldShell as unknown as VueConstructor<VueType>, {
      propsData: {
        inputId: 'field-alpha',
        label: '名称',
        help: '仅用于页面展示',
        error: '安全错误摘要'
      },
      slots: {
        default: '<input id="field-alpha" />'
      }
    });
    expect(field.find('[role="alert"]').text()).toBe('安全错误摘要');

    const input = mount(TextInput as unknown as VueConstructor<VueType>, {
      propsData: {
        id: 'name-input',
        label: '名称',
        value: ''
      }
    });
    await input.find('input').setValue('fake_model_alpha');
    expect(input.emitted('input')?.[0]).toEqual(['fake_model_alpha']);

    const select = mount(SelectShell as unknown as VueConstructor<VueType>, {
      propsData: {
        id: 'select-alpha',
        label: '状态',
        value: '',
        options: [{ value: 'unavailable', label: '暂不可用' }]
      }
    });
    expect(select.findAll('option')).toHaveLength(2);

    const checkbox = mount(CheckboxShell as unknown as VueConstructor<VueType>, {
      propsData: {
        label: '启用展示入口',
        checked: false,
        disabled: true
      }
    });
    expect(checkbox.find('input').attributes('disabled')).toBe('disabled');

    const readonly = mount(ReadonlyField as unknown as VueConstructor<VueType>, {
      propsData: {
        label: '连接状态',
        value: '暂不可用'
      }
    });
    expect(readonly.text()).toContain('暂不可用');
  });

  it('keeps action summary free of raw permission keys', () => {
    const wrapper = mount(ActionSummary as unknown as VueConstructor<VueType>, {
      propsData: {
        allowed: false,
        reason: '当前操作待接入'
      }
    });

    expect(wrapper.text()).toBe('当前操作待接入');
    expect(wrapper.text()).not.toContain('admin.');
  });

  it('provides modal, confirm dialog and drawer accessibility shells', async () => {
    const modal = mount(ModalShell as unknown as VueConstructor<VueType>, {
      propsData: {
        open: true,
        title: '详情',
        titleId: 'modal-title'
      },
      slots: {
        default: '<p>内容</p>'
      }
    });
    expect(modal.find('[role="dialog"]').attributes('aria-modal')).toBe('true');
    expect(modal.find('[role="dialog"]').attributes('aria-labelledby')).toBe('modal-title');
    await modal.find('.modal-shell__close').trigger('click');
    expect(modal.emitted('close')).toHaveLength(1);

    const confirm = mount(ConfirmDialog as unknown as VueConstructor<VueType>, {
      propsData: {
        open: true,
        title: '确认操作',
        titleId: 'confirm-title',
        message: '该操作仍待接入'
      }
    });
    const confirmButtons = confirm.findAll('button');
    await confirmButtons.at(1).trigger('click');
    expect(confirm.emitted('confirm')).toBeUndefined();

    const drawer = mount(DrawerShell as unknown as VueConstructor<VueType>, {
      propsData: {
        open: true,
        title: '抽屉',
        titleId: 'drawer-title'
      }
    });
    expect(drawer.find('[role="dialog"]').attributes('aria-labelledby')).toBe('drawer-title');
    await drawer.find('.drawer-shell__close').trigger('click');
    expect(drawer.emitted('close')).toHaveLength(1);
  });
});
