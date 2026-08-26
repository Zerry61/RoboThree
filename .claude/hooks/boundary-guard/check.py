#!/usr/bin/env python3
"""Require confirmation before a Claude Code write crosses RoboThree boundaries."""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path


def resolve_path(value: str, cwd: Path) -> Path:
    path = Path(value).expanduser()
    if not path.is_absolute():
        path = cwd / path
    return path.resolve(strict=False)


def is_within(path: Path, parent: Path) -> bool:
    try:
        path.relative_to(parent)
        return True
    except ValueError:
        return False


def scope(path: Path, root: Path) -> str:
    if is_within(path, root / "RoboThree_workspace"):
        return "product"
    if is_within(path, root / "robothree-agent-research"):
        return "research"
    if is_within(path, root / "备注文件"):
        return "backup-notes"
    if is_within(path, root):
        return "coordination"
    return "external"


def request_confirmation(message: str) -> None:
    print(
        json.dumps(
            {
                "hookSpecificOutput": {
                    "hookEventName": "PreToolUse",
                    "permissionDecision": "ask",
                },
                "systemMessage": message,
            },
            ensure_ascii=False,
        )
    )


def main() -> int:
    try:
        payload = json.load(sys.stdin)
    except (json.JSONDecodeError, OSError):
        return 0

    tool_input = payload.get("tool_input") or {}
    path_value = tool_input.get("file_path") or tool_input.get("notebook_path")
    if not isinstance(path_value, str) or not path_value:
        return 0

    configured_root = os.environ.get("CLAUDE_PROJECT_DIR")
    root = Path(configured_root or Path(__file__).parents[3]).resolve(strict=False)
    cwd = resolve_path(str(payload.get("cwd") or root), root)
    target = resolve_path(path_value, cwd)
    session_scope = scope(cwd, root)
    target_scope = scope(target, root)

    if target_scope == "backup-notes":
        request_confirmation(
            "该操作将写入仅供用户备用的 备注文件/。请确认用户已明确要求修改该文件；它不得影响工程。"
        )
        return 0

    if session_scope in {"product", "research"} and target_scope != session_scope:
        request_confirmation(
            f"当前会话位于 {session_scope}，但写入目标属于 {target_scope}。请确认这是用户明确授权的跨边界修改。"
        )
        return 0

    if session_scope == "coordination" and target_scope in {"product", "research"}:
        request_confirmation(
            f"当前会话从总协调目录写入 {target_scope} 仓库。请确认用户已明确指定该仓库和修改范围。"
        )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
