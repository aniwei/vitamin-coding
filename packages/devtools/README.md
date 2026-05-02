# @x-mars/devtools

## 模块定位

提供 Agent 调试基础设施：23 个断点、快照捕获、步进控制，通过 Worker 线程隔离。

## 核心功能

| 模块             | 功能                                                  |
| ---------------- | ----------------------------------------------------- |
| Devtools         | 顶层组合（Service + Breakpoints + Debugger + Logger） |
| Breakpoints      | 23 个断点位置 × 5 类（Agent/回合/工具/消息/系统）     |
| Debugger         | 步进控制（next/step/over/continue/stop）              |
| DebugSnapshot    | 调试快照（turn/point/messages/tokens/params）         |
| InspectorService | Worker 线程隔离的检测服务                             |

## 调试命令

| 命令         | 说明         |
| ------------ | ------------ |
| `next()`     | 到下一个断点 |
| `step()`     | 单步         |
| `over()`     | 跳过         |
| `continue()` | 继续         |
| `stop()`     | 停止         |

## 目录概览

```
src/
  types.ts           # 核心类型
  devtools.ts        # 顶层组合
  breakpoints.ts     # 断点系统
  debug-snapshot.ts  # 快照结构
  debugger.ts        # 步进控制
  service.ts         # Worker 服务
  index.ts
tests/               # 4 个测试文件
```

## 开发命令

```bash
pnpm --filter @x-mars/devtools build
pnpm --filter @x-mars/devtools typecheck
pnpm --filter @x-mars/devtools clean
```

## 关联包

`@x-mars/hooks`、`@x-mars/shared`、`@x-mars/env`、`@x-mars/invariant`
