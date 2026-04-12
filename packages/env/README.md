# @vitamin/env

## 模块定位

集中管理运行环境变量、路径常量与阈值配置。零运行时依赖，作为整个 monorepo 的配置基底。

## 核心功能

| 分类        | 导出示例                                                                                 |
| ----------- | ---------------------------------------------------------------------------------------- |
| 路径常量    | `VITAMIN_HOME`、`VITAMIN_PROJECT_DIR`、`SESSION_DIR`、`CHECKPOINT_DIR`                   |
| 工具配置    | `TOOLS_MAX_OUTPUT_LINES`、`TOOLS_EXECUTE_TIMEOUT_MS`、`TOOLS_BINARY_DOWNLOAD_TIMEOUT_MS` |
| Agent 配置  | `AGENT_TOOLS_MAX_TURNS`                                                                  |
| 内存管理    | `MEMORY_COMPACTION_TRIGGER_FRACTION`、`MEMORY_PRUNE_*` 系列                              |
| 会话管理    | `SESSION_IDLE_TIMEOUT_MS`、`SESSION_MAX`、`SESSION_PAGE_SIZE`                            |
| 工具名称    | `MEMORY_TOOL_WRITE`、`MEMORY_TOOL_READ`、`MEMORY_LEGACY_TOOL_*`                          |
| GitHub 认证 | `GITHUB_CLIENT_ID`、`GITHUB_SCOPE`、`GITHUB_COPILOT_USER_AGENT`                          |
| 功能开关    | `SETTING_OFFLINE_MODE_ENABLED`                                                           |

## 目录概览

```
src/
  index.ts       # 所有环境常量（单文件）
tests/
  env.test.ts    # normalizeEnv 边界测试
```

## 开发命令

```bash
pnpm --filter @vitamin/env build
pnpm --filter @vitamin/env typecheck
pnpm --filter @vitamin/env clean
```
