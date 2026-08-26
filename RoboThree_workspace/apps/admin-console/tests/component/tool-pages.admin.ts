import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ToolApiCreatePage from '../../src/pages/tools/ToolApiCreatePage.vue';
import ToolDetailPage from '../../src/pages/tools/ToolDetailPage.vue';
import ToolMcpCreatePage from '../../src/pages/tools/ToolMcpCreatePage.vue';
import ToolPolicyPage from '../../src/pages/tools/ToolPolicyPage.vue';
import ToolsPage from '../../src/pages/tools/ToolsPage.vue';
import type VueType from 'vue';
import type { VueConstructor } from 'vue';

const forbiddenBusinessSuccessText = ['创建成功', '保存成功', '发布成功', '安装成功', '测试成功', '同步成功'] as const;
const forbiddenSensitiveText = [
  ['API', ' Key'].join(''),
  ['Credential', ' Reference'].join(''),
  ['End', 'point'].join(''),
  ['To', 'ken'].join(''),
  ['Bear', 'er'].join(''),
  ['Capability', 'Lock'].join('')
] as const;

function expectNoForbiddenText(text: string): void {
  for (const fragment of [...forbiddenBusinessSuccessText, ...forbiddenSensitiveText]) {
    expect(text).not.toContain(fragment);
  }
}

describe('Admin Tool pages foundation', () => {
  it('renders the Tool list with prototype rows and no real operation claims', () => {
    const wrapper = mount(ToolsPage as unknown as VueConstructor<VueType>);
    const text = wrapper.text();

    expect(text).toContain('工具列表');
    expect(text).toContain('文档内容读取');
    expect(text).toContain('业务系统查询');
    expect(text).toContain('远程资料检索');
    expect(text).toContain('连接 API');
    expect(text).toContain('连接 MCP 服务');
    expect(text).toContain('代码工具由可信发布流程自动登记');
    expect(wrapper.findAll('tbody tr')).toHaveLength(3);
    expect(wrapper.findAll('button:disabled').length).toBeGreaterThanOrEqual(3);
    expectNoForbiddenText(text);
  });

  it('renders Tool detail from the route parameter without leaking sensitive fields', () => {
    const wrapper = mount(ToolDetailPage as unknown as VueConstructor<VueType>, {
      mocks: {
        $route: {
          params: {
            toolId: 'fake_tool_api_case'
          }
        }
      }
    });
    const text = wrapper.text();

    expect(text).toContain('业务系统查询');
    expect(text).toContain('接入来源');
    expect(text).toContain('连接 API');
    expect(text).toContain('真实配置能力待接入');
    expect(wrapper.findAll('button:disabled')).toHaveLength(3);
    expectNoForbiddenText(text);
  });

  it('keeps API connection as a disabled GATED form shell', () => {
    const wrapper = mount(ToolApiCreatePage as unknown as VueConstructor<VueType>);
    const text = wrapper.text();

    expect(text).toContain('连接 API');
    expect(text).toContain('真实解析、验证和保存能力待接入');
    expect(text).toContain('请勿输入真实访问材料');
    expect(text).toContain('解析并填入');
    expect(wrapper.findAll('input:disabled')).toHaveLength(5);
    expect(wrapper.findAll('select:disabled')).toHaveLength(1);
    expect(wrapper.findAll('button:disabled').length).toBeGreaterThanOrEqual(1);
    expectNoForbiddenText(text);
  });

  it('keeps MCP connection as a disabled discovery shell', () => {
    const wrapper = mount(ToolMcpCreatePage as unknown as VueConstructor<VueType>);
    const text = wrapper.text();

    expect(text).toContain('连接 MCP');
    expect(text).toContain('真实发现、选择和保存能力待接入');
    expect(text).toContain('发现结果');
    expect(wrapper.findAll('input:disabled')).toHaveLength(3);
    expect(wrapper.findAll('select:disabled')).toHaveLength(1);
    expect(wrapper.findAll('button:disabled').length).toBeGreaterThanOrEqual(1);
    expectNoForbiddenText(text);
  });

  it('keeps Tool policy operations disabled until real facts are connected', () => {
    const wrapper = mount(ToolPolicyPage as unknown as VueConstructor<VueType>);
    const text = wrapper.text();

    expect(text).toContain('Tool 策略配置');
    expect(text).toContain('真实策略保存能力待接入');
    expect(wrapper.findAll('input:disabled')).toHaveLength(2);
    expect(wrapper.findAll('select:disabled')).toHaveLength(2);
    expect(wrapper.findAll('button:disabled')).toHaveLength(1);
    expectNoForbiddenText(text);
  });
});
