import { describe, expect, it } from "vitest";

import {
  buildLoadedCatalogSummary,
  buildRobotDetailView,
  buildRobotSummaryCard,
  buildToolDetailView,
  buildToolSummaryCard,
  filterCards,
  presentCatalogError,
} from "../src/renderer/pages/intelligence/intelligence-model.js";

const digest = "a".repeat(64);

describe("DFE-7A intelligence catalog model", () => {
  it("builds robot summary from Summary fields only", () => {
    const card = buildRobotSummaryCard(robotSummary());

    expect(card).toMatchObject({
      id: "agent.general",
      name: "通用机器人",
      sourceLabel: "本地可信",
      runnableLabel: "可运行",
    });
    expect(card.restrictionLabels).toEqual([
      "模型：不限制",
      "技能：已限制可用范围",
      "工具：明确不允许使用任何此类资源",
      "知识：不限制",
    ]);
    expect(JSON.stringify(card)).not.toMatch(/defaultModel|eligibleModels|createdByMe|workspaceRoot|rootRealPath/u);
  });

  it("builds robot detail only after detail projection is loaded", () => {
    const detail = buildRobotDetailView(robotDetail());

    expect(detail.defaultModel.name).toBe("GPT Test");
    expect(detail.allowModelOverrideLabel).toBe("允许任务临时切换模型");
    expect(detail.tools.map((tool) => tool.name)).toEqual(["XLSX 写入"]);
    expect(JSON.stringify(detail)).not.toMatch(/revision|digest|workspaceRoot|rootRealPath/u);
  });

  it("maps all tool risk facts and input/output shapes without legacy callable labels", () => {
    const detail = buildToolDetailView({
      ...toolSummary(),
      riskSummary: [
        "routine_file",
        "destructive_file",
        "protected_resource",
        "local_execution",
        "external_send",
        "unknown",
      ],
      inputShape: "structured_object",
      outputShape: "unspecified",
    });

    expect(detail.riskLabels).toEqual([
      "常规文件操作",
      "可能修改或删除文件",
      "涉及受保护资源",
      "可在本地执行操作",
      "可向外部发送数据",
      "风险状态未知",
    ]);
    expect(detail.inputShapeLabel).toBe("结构化输入");
    expect(detail.outputShapeLabel).toBe("输出形态未声明");
    expect(JSON.stringify(detail)).not.toMatch(/modelCallable|lifecycleLabel|模型可调用|已接入/u);
  });

  it("filters only loaded safe display fields and reports loaded counts honestly", () => {
    const robot = buildRobotSummaryCard(robotSummary());
    const tool = buildToolSummaryCard(toolSummary());

    expect(filterCards([robot, tool], "xlsx")).toEqual([tool]);
    expect(buildLoadedCatalogSummary({
      robots: [robotSummary()],
      tools: [toolSummary()],
      robotNextCursor: "r3cat1.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    })).toEqual({
      loadedRobots: 1,
      loadedTools: 1,
      availableTools: 1,
      robotsComplete: false,
      toolsComplete: true,
    });
  });

  it("freezes catalog error presentation including request aborted", () => {
    expect(presentCatalogError({ code: "catalog.invalid_query" }).description)
      .toContain("目录请求无效");
    expect(presentCatalogError({ code: "catalog.cursor_invalid" }).description)
      .toContain("分页位置");
    expect(presentCatalogError({ code: "catalog.stale_cursor" }).description)
      .toContain("目录已变化");
    expect(presentCatalogError({ code: "catalog.registry_unavailable" }).description)
      .toContain("目录暂时不可用");
    expect(presentCatalogError({ code: "catalog.integrity_violation" }).description)
      .toContain("完整性");
    expect(presentCatalogError({ code: "catalog.response_too_large" }).description)
      .toContain("安全大小");
    expect(presentCatalogError({ code: "catalog.robot_not_found" }).description)
      .toContain("机器人不存在");
    expect(presentCatalogError({ code: "catalog.tool_not_found" }).description)
      .toContain("工具不存在");
    expect(presentCatalogError({ code: "catalog.client_mismatch" }).description)
      .toContain("客户端身份");
    expect(presentCatalogError({ code: "catalog.runtime_changed" }).description)
      .toContain("Core 已重启");
    expect(presentCatalogError({ code: "contract.feature_unavailable" }).description)
      .toContain("目录能力暂不可用");
    expect(presentCatalogError({ code: "runtime.request_aborted" }).description)
      .toContain("较新的页面状态");
  });
});

function robotSummary() {
  return {
    robotId: "agent.general",
    configurationRevision: digest,
    displayName: "通用机器人",
    description: "处理本地优先任务和文档工作流。",
    source: "local_trusted" as const,
    restrictionSummary: {
      models: "unrestricted" as const,
      skills: "restricted_nonempty" as const,
      tools: "restricted_empty" as const,
      knowledge: "unrestricted" as const,
    },
    runnable: true,
  };
}

function robotDetail() {
  return {
    ...robotSummary(),
    defaultModel: resource("model.gpt", "GPT Test"),
    allowModelOverride: true,
    eligibleModels: [resource("model.gpt", "GPT Test")],
    skills: [resource("skill.document.review", "文档审阅")],
    tools: [resource("tool.document.xlsx.write", "XLSX 写入")],
    knowledge: [],
  };
}

function toolSummary() {
  return {
    toolId: "tool.document.xlsx.write",
    capabilityRevision: digest,
    registryRevision: digest,
    displayName: "XLSX 写入",
    description: "创建或覆盖 XLSX。",
    source: "enterprise_package" as const,
    readOnly: false,
    riskSummary: ["routine_file", "destructive_file"] as const,
    availability: "available" as const,
  };
}

function resource(resourceId: string, displayName: string) {
  return {
    resourceId,
    revision: digest,
    displayName,
    availability: "available" as const,
  };
}
