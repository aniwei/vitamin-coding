# @vitamin/coding

## 模块定位

应用装配层，将各子系统组合成完整的 Vitamin 编码助手。管理 VitaminApp 容器和 AgentSession 对话周期。

## 核心功能

| 模块 | 功能 |
|------|------|
| VitaminApp | 依赖注入容器，装配所有子系统 |
| AgentSession | 对话生命周期，消息持久化 + 事件流转发 + 工具网关 |
| CodingSessionManager | 多会话容器（InMemory / Disk / Remote） |
| Runner | 4 种运行模式（Print / JSON / RPC / Interactive） |

## 目录概览

```
src/
  types.ts                    # 核心类型
  vitamin-app.ts              # 应用容器
  agent-session.ts            # 对话生命周期
  coding-session-manager.ts   # 多会话管理
  run/
    print.ts                  # Print 模式
    json.ts                   # JSON 模式
    rpc.ts                    # RPC 模式
    interactive.ts            # 交互式 REPL
  index.ts
tests/
example/
docs/
```

## 开发命令

```bash
pnpm --filter @aspect/coding build
pnpm --filter @aspect/coding typecheck
pnpm --filter @aspect/coding clean
```

## 关联包

依赖几乎所有 `@vitamin/*` 子包，作为顶层组装。
