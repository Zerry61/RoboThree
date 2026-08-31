# MVP-VS2.1 Workspace Source Read 实施报告

> 版本：`0.0.0-mvp.vs2.1`  
> 状态：**PASS/CLOSED（独立 QA 与用户接受完成）**  
> 范围：工作空间 DOCX/XLSX/PDF read Tool 的 exact production consumption 与 DOCX → PPTX focused integration

## 1. 用户能力增量

专项“演示文稿助手”不再只能生成 PPTX。用户选择已授权工作空间并在任务中明确给出资料相对路径后，模型可以先
调用与文件类型匹配的 Document read Tool，读取结果会作为 Tool Observation 回到同一个 Agent Loop，再由模型
规划并调用 PPTX write Tool。无文件输入的 VS1 路径保持不变。

## 2. 实现

- Presentation Agent 使用四项显式 Tool allowlist：DOCX read、XLSX read、PDF text read、PPTX write；
- Catalog projection、R2D Registry、Entitlement、permissions 和 acceptance lease 保存同一组 exact refs；
- Tool candidate policy 只返回专项 Agent entitlement 中已锁定的 Tool，不加载 Document Tool 全集；
- Capability Lock 为每个候选逐项核对 capability ID/revision，任一不一致 fail-closed；
- Agent instructions 明确先读取用户指定资料，再生成 PPTX，不允许声称未执行的读取或写入结果。

## 3. 运行级证据

focused integration 创建真实 DOCX 文件并执行三轮模型调用：

1. Model 返回 `tool.document.docx.read`；
2. Document Worker 提取正文，其中“段落 Unicode 你好 β”进入下一轮 Gateway request；
3. Model 返回 `tool.document.pptx.write`，生成非空 `资料汇报.pptx`；
4. 最后一轮返回完成摘要；
5. Task detail 中 read/write Tool activity 均为 completed，源 DOCX 与输出 PPTX 均有 Artifact projection。

## 4. 门禁

- Core typecheck：PASS；
- focused ESLint：PASS；
- `vs1.2-presentation-skill` + internal-trial runtime integration：2 files / 9 tests PASS；
- Document Tool context/registry + DTP-4 audit self-test：3 files / 14 tests PASS；
- DTP-4 packaging audit：PASS；
- `git diff --check`：PASS。

## 5. 边界

- 没有新增或修改公开 Contract；
- migration 仍止 26，依赖与 lockfile 不变；
- 没有实现 Workbench 附件选择，当前用户需在任务中明确工作空间相对路径；
- 没有恢复 Personal Model、Admin mutation、TGM、Knowledge Provider 或 Agent Lifecycle；
- 本批不声明 production ready，也不以演示彩排或真实公网 Provider 冒烟作为关闭条件。
