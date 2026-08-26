# Desktop

RoboThree Electron 桌面客户端。当前开发版本为
`0.0.0-dcf.1.3c`。正式启动路径已经使用受监督的 Local Core 子进程、
随机 loopback 端口、单次启动令牌、类型化 Main Client 和 Desktop Local
Runtime `v1alpha1`；沙箱 Preload 使用专用的单文件 CommonJS bundle，并由真实
Electron smoke 验证。DCF-0 Fixture 只保留给 smoke/test，不再进入生产启动路径。

- `src/main`：Electron 主进程、正式 Core 子进程监督和 Main-only 类型化 Client。
- `src/preload`：对输入和输出执行 Contract 校验的固定业务白名单 IPC。
- `src/renderer`：Workspace、Session、Chat 和 Agent/Model 最小工作台，不直接
  访问系统能力。
- `src/shared`：DCF-0 状态兼容类型、固定 IPC channel 与 Renderer-safe
  `RoboThreeDesktopApi v1alpha1` 视图。
- `resources`：应用图标等打包资源。
- `tests`：桌面端测试。

DCF-1.2A 已关闭。DCF-1.2B 已实现 Preload 白名单、Main 内目录选择、Workspace
授权与撤销、Session 管理、Agent/Model 选择、SubmitTurn、持久 Message Snapshot
和最小运行状态；repair.1 已修复用户现场演示发现的 ESM Preload 加载失败，
repair.2 已修复 Workspace Picker 通用命令元数据与严格五字段请求冲突。当前
用户现场演示和 repair.2 独立 QA 均已通过并由用户接受，DCF-1.2B 正式关闭。
DCF-1.2C 已实现 Scripted Model 临时 token delta、持久 Message 收敛、
Snapshot-first 自动重连、cursor replay/reset 和运行代切换清理；独立 QA 已由
用户接受，DCF-1.2C 与 DCF-1.2 阶段正式关闭。DCF-1.3A 已实现六态 lifecycle、
最多一次自动恢复、受控 restart、旧 token/Client/SSE/selectionHandle 失效和
SQLite 持久事实恢复，独立 QA 已由用户接受并关闭；DCF-1.3B 的 SSE 背压、
慢消费者断开、资源回收和去重指标也已通过独立 QA 并由用户接受关闭。
DCF-1.3C 已完成独立长稳 Harness，开发者实际 30/60 分钟模式与完整门禁均通过，
Claude Code 也已实际重跑完整 30/60 分钟 Harness；独立 QA 已由用户接受，
DCF-1.3C 与 DCF-1.3 阶段正式关闭。CGF-1.3 继续 `GATED`，不自动解锁。

## 验证

```bash
pnpm --filter @robothree/desktop build
pnpm --filter @robothree/desktop smoke
pnpm --filter @robothree/desktop smoke:preload
pnpm run harness:dcf13c:30
pnpm run harness:dcf13c:60
```

完整门禁从产品工程根目录执行 `pnpm run check`。
