# DCF-2C 用户现场体验指南

## 目的

本演示验证：

```text
创建 Session
→ 提交固定的本地 Echo Tool Task
→ 进入等待用户确认
→ 关闭并重启 Desktop/Core
→ 恢复同一等待确认
→ 用户允许
→ 真实进程外 Echo Tool 完成
→ 再次重启后结果仍存在且不重复
```

演示模式使用独立 Electron `userData/dcf2c-demo` 目录和独立 SQLite，不读取或
修改正常 Desktop 数据。演示 Tool 只处理 Core 内置的固定 JSON，不执行用户
输入、Shell 命令或业务文件操作。

## 启动

关闭其他 RoboThree/Electron 窗口，在 macOS「终端」粘贴：

```bash
source ~/.nvm/nvm.sh
nvm use 24.13.0
cd /Users/changzhengyi/Desktop/RoboThree/RoboThree_workspace
pnpm run demo:dcf2c
```

如果提示找不到 `pnpm`，先执行：

```bash
corepack enable
corepack prepare pnpm@11.11.0 --activate
```

## 现场步骤

1. 点击「授权目录」，选择一个测试目录；
2. 点击「新建会话」；
3. 确认 Agent 为 `RoboThree DCF-2C Demo Agent`，Model 为
   `DCF-2C Scripted Demo Model`；
4. 输入 `执行 DCF-2C 用户确认与重启恢复演示` 并发送；
5. 等待页面出现用户确认卡片，此时先不要点击允许；
6. 使用 `Command + Q` 完全退出 RoboThree；
7. 回到终端，再次执行 `pnpm run demo:dcf2c`；
8. 打开原会话，确认同一 Task 仍处于等待确认，确认卡片仍存在；
9. 点击「允许」；
10. 确认 Tool Activity 显示完成，并出现：
    `DCF-2C Demo Echo 已执行完成，重启恢复和用户确认链路验证通过。`；
11. 再次 `Command + Q`，再运行 `pnpm run demo:dcf2c`；
12. 打开原会话，确认 Task 仍为完成，且最终 Assistant 消息只有一条。

## 完成标准

- 重启前后的 Task 是同一条；
- 等待确认可以恢复；
- 未允许前没有 Tool 完成记录；
- 允许后 Tool Activity 完成；
- 第二次重启后最终消息仍在且没有重复；
- 正常启动命令的数据和会话没有被本演示改变。

完成后由用户明确接受现场体验，才能关闭 DCF-2C 与 DCF-2。CGF-2 仍保持
`GATED`。
