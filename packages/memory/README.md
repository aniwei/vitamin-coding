# @vitamin/memory

## 模块定位

管理 Agent 的工作记忆：LLM 驱动的压缩、无 LLM 修剪、归档持久化、多源记忆和经验学习。

## 核心功能

| 模块 | 功能 |
|------|------|
| MemoryManager | prune → compaction → archive 管线协调 |
| PersistentMemory | 多源 AGENTS.md 加载（全局/项目/社区） |
| TokenEstimator | 快速 token 估算（text.length / 4） |
| OperationalLearningStore | 经验教训存储与检索 |
| FileStateManager | 工作空间文件变更追踪 |
| Archive | 归档存储（Memory / Local / HTTP） |

## 目录概览

```
src/
  types.ts                    # 核心类型
  memory-manager.ts           # 管线协调
  persistent-memory.ts        # 持久记忆
  token-estimator.ts          # token 估算
  operational-learning-store.ts  # 经验学习
  file-state-manager.ts       # 文件状态
  archive/                    # 归档后端
  prompts/                    # LLM 压缩模板
  index.ts
tests/                        # 6 个测试文件
```

## 开发命令

```bash
pnpm --filter @vitamin/memory build
pnpm --filter @vitamin/memory typecheck
pnpm --filter @vitamin/memory clean
```

## 关联包

`@vitamin/persistence`、`@vitamin/shared`、`@vitamin/env`、`@vitamin/invariant`
