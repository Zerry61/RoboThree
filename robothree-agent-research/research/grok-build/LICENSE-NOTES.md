# grok-build License Notes

## 项目许可证

- **First-party code**: Apache License 2.0
- **SPDX**: Apache-2.0
- **许可证文件**: `LICENSE` (repo root)

## 第三方代码

### crates.io / git 依赖

详见 `THIRD-PARTY-NOTICES` 文件。

### In-tree Ports

| 来源 | 路径 | 原始许可证 | 说明 |
| --- | --- | --- | --- |
| openai/codex 工具实现 | `crates/codegen/xai-grok-tools/src/implementations/codex/` | 参见 `THIRD_PARTY_NOTICES.md` | 带有 Apache §4(b) 修改声明 |
| sst/opencode 工具实现 | `crates/codegen/xai-grok-tools/src/implementations/opencode/` | 参见 `THIRD_PARTY_NOTICES.md` | 带有 Apache §4(b) 修改声明 |

### Vendored Code

| 来源 | 路径 | 原始许可证 | 说明 |
| --- | --- | --- | --- |
| Mermaid diagram stack | `third_party/` | 参见 `third_party/NOTICE` | 图表渲染 |

## RoboThree 兼容性

- Apache 2.0 是宽松许可证，允许商业使用、修改、分发、私人使用
- codex/opencode port 部分的原始许可证需单独审查后再决定是否可复用
- 不可直接复制 `third_party/` 下的 vendored 代码到 RoboThree（需确认上游许可证）

## 审查状态

- [x] 主许可证已确认 (Apache 2.0)
- [x] 第三方声明文件已找到 (THIRD-PARTY-NOTICES, THIRD_PARTY_NOTICES.md, third_party/NOTICE)
- [ ] 完整第三方依赖树未检查（依赖 Cargo.lock，未做 `cargo license` 扫描）
