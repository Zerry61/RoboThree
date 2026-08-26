# AFE-1.1 Preflight 清理与共享依赖收口报告

> 日期：2026-08-24  
> 状态：**PASS/CLOSED**  
> 上游：AFE-1.1 独立 QA `PASS`，用户正式接受并授权清理

## 1. 清理范围

- 删除已完成证据职责的 `apps/admin-console-preflight/**`；
- 保留正式 `apps/admin-console/**`；
- 不修改 Desktop、Core、Central、Contracts、Main、Preload 或 Renderer 生产源码；
- 不进入 Admin 真实 Adapter 或业务页面开发。

## 2. 依赖收口

- 使用标准 `pnpm install --lockfile-only` 重新生成 `pnpm-lock.yaml`，未手工编辑；
- preflight importer 已从 lockfile 移除；
- 新 lockfile SHA-256：
  `b7c6d0a7906001ef503a3c0365663153265aa601103779eeacbd10d1a7f5ade5`；
- 清理执行时 `package.json` SHA-256 保持
  `a3a874ff0e0c44e3e79dc0500d264691e92467cc959eb5563764a9aaa8cb29ba`；
- 用户接受后的复核窗口内，根 `package.json` 已由并行 DFI-3A.1 批次推进至
  `0.0.0-dfi.3a.1`，当前 SHA-256 为
  `5ebcc5cea1c717cbb97a8958b8a4e86a0774122f13877f0eab432a1c4ceeaf76`；该变化不属于 AFE-1.1
  preflight 清理；
- `pnpm-workspace.yaml` SHA-256 保持
  `2b2e58f53ed0323612b3945a3ab0198018482d5f01f244c07fb8951b13e33f90`；
- 离线 frozen install 诚实发现本地 store 缺少 `yaml@2.9.0`，随后使用同一 lockfile 完成联网
  `CI=true pnpm install --frozen-lockfile`，未改变依赖解析结果。

## 3. 收口门禁

| 门禁 | 结果 |
| --- | --- |
| Admin typecheck | PASS |
| Admin negative typecheck | PASS；3 fixtures / 2 diagnostics |
| Admin build | PASS；61 modules |
| Admin tests | PASS；5 files / 14 tests |
| Admin static scan | PASS；5 个正向敏感注入命中，source/page violations 0 |
| Admin dependency scan | PASS |
| Admin dev startup smoke | PASS；固定端口启动并释放 |
| Admin `why vue` | PASS；仅 Vue 2.7.16 |
| Desktop `why vue` | PASS；仅 Vue 3.5.40 |
| Desktop build | PASS |
| Desktop tests | PASS；57 files / 226 tests |
| Root `CI=true pnpm run check` | PASS；清理时 240 files / 1603 tests + 3 smoke，Architecture boundary PASS；DFI-3A.1 并行批次叠加后复跑为 242 files / 1613 tests + 3 smoke，Architecture boundary PASS |

## 4. 最终边界

AFE-1.1 Scaffold / Route Shell 与本次 preflight 清理正式 `PASS/CLOSED`。Admin 真实登录、Admin API
Adapter、Model/Robot/Skill/Tool/Knowledge/System 业务接口与页面仍需 AAPI/AFE 独立批次，不因本次关闭自动解锁。
