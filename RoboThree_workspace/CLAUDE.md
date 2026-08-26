# RoboThree Claude Code Instructions

开始修改前，阅读根目录 `README.md`、`CHANGELOG.md` 和 `docs/development/DEVELOPMENT-LOG.md` 的最新版本记录。

完成代码、协议、配置、依赖、架构或安全方面的有效改动后，必须在交付前按照 `CHANGELOG.md` 的触发规则更新 `Unreleased`。一个任务只记录逻辑变更，不逐文件记流水账。

修改有效代码、Contract、依赖、构建、安全或测试基线时，还必须按照 `docs/development/README.md` 升级开发版本，并在 `DEVELOPMENT-LOG.md` 追加本批范围、上游来源、自测命令、结果、已知缺口和 QA 状态。不得覆盖历史开发记录。

进行独立 QA 时，优先使用工作区根 `.claude/skills/independent-qa-acceptance/`。验收前按 `.node-version` 使用项目声明的 Node.js 版本；第一轮验收不修改产品业务代码，修复复验必须锁定新的开发版本。报告保存到 `docs/development/qa/<version>-claude-qa.md`，并回链对应开发版本。

保持当前最小 Monorepo 边界；没有真实需求时不要提前创建应用、服务或公共包。
