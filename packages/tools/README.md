# @vitamin/tools

## 模块定位

提供 Agent 可用工具的注册、分组与发现能力，内置 30+ 工具覆盖 8 个功能域。

## 核心功能

| 域 | 工具 |
|----|------|
| 文件系统 | `read_file` / `write_file` / `edit_file` / `multi_edit` |
| 搜索 | `list_dir` / `find_file` / `grep` / `semantic_search` |
| Shell | `bash` |
| Web | `web_search` / `web_fetch` |
| 编排 | `task_delegate` / `write_todos` / `agent_call` / `review_call` / `plan_call` / `ask_user` / `plan_approval` / `approval` / `abort_task` |
| 会话 | `session_summary` / `session_history` |
| 技能 | `load_skill` |
| LSP | `lsp_definition` / `lsp_references` / `lsp_symbols` / `lsp_diagnostics` / `lsp_rename` |

## 预设层级

| 预设 | 说明 |
|------|------|
| `minimal` | 仅只读工具 |
| `standard` | 标准开发工具集 |
| `full` | 全部工具 |

## 目录概览

```
src/
  types.ts                    # 核心类型
  tool-registry.ts            # 工具注册表
  binary-executor-registry.ts # 二进制工具管理
  builtin-tools/
    fs/                       # 文件系统工具
    search/                   # 搜索工具
    shell/                    # Shell 工具
    web/                      # Web 工具
    orchestration/            # 编排工具
    session/                  # 会话工具
    skill/                    # 技能工具
    lsp/                      # LSP 工具
  index.ts
tests/                        # 8 个测试文件
```

## 开发命令

```bash
pnpm --filter @vitamin/tools build
pnpm --filter @vitamin/tools typecheck
pnpm --filter @vitamin/tools clean
```

## 关联包

`@vitamin/agent`、`@vitamin/shared`、`@vitamin/env`、`@vitamin/invariant`
