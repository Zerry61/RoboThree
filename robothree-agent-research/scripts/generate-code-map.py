#!/usr/bin/env python3
"""generate-code-map.py

从 sources/<project>/ 抽取代码地图，输出到 research/<project>/code-map.json。

阶段一为占位实现：
  - 校验 sources/<project> 是否存在。
  - 校验 research/<project> 是否存在。
  - 校验 analysis.json 是否存在；若不存在，给出下一阶段要做的 TODO。

未来会读取 module.schema.json，把 entries 写入 code-map.json。
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCHEMA_MODULE = ROOT / "schemas" / "module.schema.json"


def cmd_generate(project: str) -> int:
    src = ROOT / "sources" / project
    res = ROOT / "research" / project
    if not src.exists():
        print(f"error: {src} does not exist", file=sys.stderr)
        return 2
    if not res.exists():
        print(f"error: {res} does not exist (create research/{project}/ first)", file=sys.stderr)
        return 2
    analysis = res / "analysis.json"
    if not analysis.exists():
        print(f"warn: {analysis} missing — placeholder, no real code map generated")
    print(f"[generate-code-map] project={project}")
    print(f"[generate-code-map] schema={SCHEMA_MODULE.relative_to(ROOT)}")
    print("TODO (阶段二):")
    print(f"  1. 读取 sources/{project}/ 的目录结构")
    print(f"  2. 对每个 .ts / .py / .go 文件，按 module.schema.json 抽取 entries")
    print(f"  3. 写入 research/{project}/code-map.json")
    return 0


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description="RoboThree code map generator (placeholder)")
    parser.add_argument("project", help="research target (e.g. grok-build)")
    args = parser.parse_args(argv)
    return cmd_generate(args.project)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
