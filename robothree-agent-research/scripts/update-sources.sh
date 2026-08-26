#!/usr/bin/env bash
# update-sources.sh
#
# 统一管理 `sources/<project>/` 下的源码镜像。
#
# 用法：
#   ./scripts/update-sources.sh <project-name> [--fetch] [--lock]
#
# <project-name> 必须在 `sources/` 下存在对应的子目录和 README.md。
#
# 阶段一为占位实现：仅打印"应当做什么"，并校验目录存在。
# 阶段二会替换为真实 git clone + checkout + commit 记录。

set -euo pipefail

PROJECT="${1:-}"
if [[ -z "$PROJECT" ]]; then
  echo "usage: $0 <project-name> [--fetch] [--lock]" >&2
  exit 64
fi

PROJECT_DIR="sources/${PROJECT}"
if [[ ! -d "${PROJECT_DIR}" ]]; then
  echo "error: ${PROJECT_DIR} does not exist" >&2
  echo "hint: create sources/${PROJECT}/README.md first." >&2
  exit 66
fi

echo "[update-sources] project=${PROJECT}"
echo "[update-sources] project_dir=${PROJECT_DIR}"
echo
echo "TODO (阶段二):"
echo "  1. 根据 sources/${PROJECT}/README.md 解析 owner/repo"
echo "  2. git clone --bare 或 git clone 到 sources/${PROJECT}/"
echo "  3. 锁定到 commit，写入 research/${PROJECT}/analysis.json 的 commit.sha"
echo "  4. 通过 scripts/verify-citations.py 校验所有报告引用"
echo
echo "[update-sources] placeholder implementation — no remote operation performed."
