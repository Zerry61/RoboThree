#!/usr/bin/env python3
"""verify-citations.py

校验 research/<project>/ 下所有 *.md 文件中的源码引用是否有效：
  - <project>@<short-sha>:path/to/file.ts:LL  格式
  - 在 sources/<project>/ 中确实存在该 path（在阶段二源码拉取后才有意义）
  - 行号范围在文件内（可选校验项）
  - 引用对应的 confidence 标记（[F]/[I]/[R]）存在

阶段一为占位实现：仅做格式正则 + 路径校验，不读取实际源码。
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CITATION_RE = re.compile(
    r"(?P<project>[a-z0-9_-]+)@(?P<sha>[a-f0-9]{7,40}):(?P<path>[^:]+):(?P<line>\d+)(?:-(?P<line_end>\d+))?"
)
CONFIDENCE_RE = re.compile(r"\[(F|I|R)\]")


def verify_project(project: str) -> int:
    res = ROOT / "research" / project
    if not res.exists():
        print(f"error: {res} does not exist", file=sys.stderr)
        return 2
    src = ROOT / "sources" / project

    md_files = sorted(res.rglob("*.md"))
    if not md_files:
        print(f"warn: no markdown files in {res}")
        return 0

    total_citations = 0
    orphaned_citations = 0
    missing_confidence_files: list[Path] = []
    for md in md_files:
        text = md.read_text()
        citations = list(CITATION_RE.finditer(text))
        total_citations += len(citations)
        for c in citations:
            if src.exists():
                target = src / c.group("path")
                if not target.exists():
                    orphaned_citations += 1
                    print(
                        f"[orphan] {md.relative_to(ROOT)}: "
                        f"{c.group('project')}@{c.group('sha')}:{c.group('path')}:{c.group('line')}"
                    )
        # require at least one confidence tag per .md
        if not CONFIDENCE_RE.search(text):
            missing_confidence_files.append(md)

    print()
    print(f"[verify-citations] project={project}")
    print(f"[verify-citations] markdown_files={len(md_files)}")
    print(f"[verify-citations] total_citations={total_citations}")
    print(f"[verify-citations] orphan_citations={orphaned_citations}")
    if missing_confidence_files:
        print("[verify-citations] files_without_confidence_tag:")
        for f in missing_confidence_files:
            print(f"  - {f.relative_to(ROOT)}")
    return 0


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description="RoboThree citation verifier (placeholder)")
    parser.add_argument("project", help="research target (e.g. grok-build)")
    args = parser.parse_args(argv)
    return verify_project(args.project)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
