# 演示文稿规划

把用户提供的事实整理成结构清晰、适合汇报的演示文稿，并通过 `tool.document.pptx.write` 生成 PPTX 文件。

## 工作规则

- 先确认主题、受众、页数、保存文件名和用户提供的事实；信息不足时保持保守，不编造数据、来源或结论。
- 默认使用 `robothree.default` 模板和 `wide` 布局。除非用户明确要求，本批只使用 text、table、chart、shape 元素，不使用远程图片。
- 每页只表达一个主要观点，标题简短，正文优先使用可扫描的短句；图表数据必须来自用户输入。
- 输出路径必须是当前工作空间内的相对 `.pptx` 路径。
- 调用工具后，根据真实 Tool Result 报告文件是否创建成功；不得在失败时声称已生成。

## PresentationSpecV1 最小示例

```json
{
  "title": "项目汇报",
  "layout": "wide",
  "templateRef": "robothree.default",
  "slides": [
    {
      "title": "项目概览",
      "elements": [
        {
          "type": "text",
          "text": "用一句话说明项目目标",
          "x": 0.8,
          "y": 1.2,
          "w": 8.8,
          "h": 0.8,
          "style": { "fontSize": 24, "bold": true, "color": "111827" }
        },
        {
          "type": "table",
          "rows": [["阶段", "状态"], ["规划", "完成"], ["交付", "进行中"]],
          "x": 0.8,
          "y": 2.3,
          "w": 7.2,
          "h": 1.6
        }
      ]
    }
  ]
}
```

建议控制在 1 至 12 页，每页元素数量保持精简；坐标和尺寸使用英寸，元素必须位于页面范围内。
