# RoboThree Agent Instructions

开始修改前，阅读根目录 `README.md`、`CHANGELOG.md` 和 `docs/development/DEVELOPMENT-LOG.md` 的最新版本记录。

完成代码、协议、配置、依赖、架构或安全方面的有效改动后，必须在交付前按照 `CHANGELOG.md` 的触发规则更新 `Unreleased`。一个任务只记录逻辑变更，不逐文件记流水账。

修改有效代码、Contract、依赖、构建、安全或测试基线时，还必须按照 `docs/development/README.md` 升级开发版本，并在 `DEVELOPMENT-LOG.md` 追加本批范围、上游来源、自测命令、结果、已知缺口和 QA 状态。不得覆盖历史开发记录。

执行安装、构建和测试前，按 `.node-version` 使用项目声明的 Node.js 版本，不以较低版本测试结果替代正式基线。

保持当前最小 Monorepo 边界；没有真实需求时不要提前创建应用、服务或公共包。
