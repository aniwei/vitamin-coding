# @vitamin/hooks

## 模块定位

提供 Agent 生命周期各阶段可插拔的拦截和变换机制，内置权限策略体系。

## 核心功能

| 模块 | 功能 |
|------|------|
| HookRegistry | 31 种时机的 Hook 注册、优先级排序、执行引擎 |
| PermissionPolicyRegistry | 权限策略注册与评估（allow/deny/escalate） |
| PermissionAuditLog | 权限决策审计轨迹 |
| PermissionGuardHook | 权限 -> tool:guard 集成 |
| 内置策略 | FILE_GUARD / DESTRUCTIVE_COMMAND / 模式策略 / 冻结 / 黑白名单 |
| 预设 | default / strict / minimal / none 四种权限模式 |
| 23+ 内置 Hooks | 会话 / 工具防护 / 变换 / 质量 / 流 / 压缩 / 后台 |

## Hook 时机（31 种）

**会话**：`session:before` / `session:after` / `message:before` / `message:after` / `turn:before` / `turn:after`
**工具**：`tool:before` / `tool:after` / `tool:validate` / `tool:guard` / `tool:fallback` / `tool:retry`
**变换**：`context:transform` / `prompt:transform` / `response:transform` / `output:transform`
**质量**：`quality:review` / `quality:verify` / `quality:reflect`
**流**：`stream:chunk` / `stream:error`
**压缩**：`compaction:before` / `compaction:after`
**后台**：`background:start` / `background:end`

## 目录概览

```
src/
  types.ts                  # 核心类型
  hook-registry.ts          # Hook 注册与执行
  permission/
    permission-policy-registry.ts
    permission-audit-log.ts
    permission-guard-hook.ts
    builtin-policies.ts
    presets.ts
  builtin-hooks/
    session/                # 6 个会话 Hook
    tool-guard/             # 6 个工具防护 Hook
    transform/              # 4 个变换 Hook
    quality/                # 3 个质量 Hook
    stream/                 # 2 个流 Hook
    compaction/             # 2 个压缩 Hook
    background/             # 2 个后台 Hook
  index.ts
tests/                      # 7 个测试文件
```

## 开发命令

```bash
pnpm --filter @vitamin/hooks build
pnpm --filter @vitamin/hooks typecheck
pnpm --filter @vitamin/hooks clean
```

## 关联包

`@vitamin/shared`、`@vitamin/invariant`、`@vitamin/env`
