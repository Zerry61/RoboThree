# scripts/

自动化脚本。

## 当前脚本

- [`update-sources.sh`](./update-sources.sh) — 拉取 / 锁定 `sources/<project>/` 源码。
- [`generate-code-map.py`](./generate-code-map.py) — 生成 `research/<project>/code-map.json`。
- [`verify-citations.py`](./verify-citations.py) — 校验报告中所有 `<project>@<sha>:path:LL` 引用。

## 状态

阶段一：所有脚本为占位实现（不进行真实网络或文件系统破坏性操作），但已经：

- 定义命令行接口；
- 校验输入目录；
- 给出下一阶段的 TODO。

阶段二任务：

1. 在 `update-sources.sh` 中补全 git clone + `commit.sha` 捕获。
2. 让 `generate-code-map.py` 用 tree-sitter 或 `pyast` 抽取 module entries。
3. 让 `verify-citations.py` 实测行号范围。

## 运行示例

```bash
./scripts/update-sources.sh grok-build
python3 scripts/generate-code-map.py grok-build
python3 scripts/verify-citations.py grok-build
```
