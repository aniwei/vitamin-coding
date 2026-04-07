# @vitamin/memory 设计说明

## 设计目标

- 管理 Agent 的工作记忆：压缩、归档、修剪、经验学习。
- 提供多源持久记忆加载（全局 / 项目 / 社区 AGENTS.md）。
- 支持 LLM 驱动的智能摘要和无 LLM 的快速修剪。

## 非目标

- 不负责消息存储（会话层由 `@vitamin/session` 管理）。
- 不直接调用 LLM（通过注入的 summarize 回调完成）。

## 实现原理

### MemoryManager（memory-manager.ts）

管理工作记忆生命周期的核心协调器。按管线处理：

```
消息历史 → 检查阈值 → prune → compaction → archive
```

- **修剪（Prune）**：无 LLM 的快速 token 清理。移除已完成的工具调用结果、截断过长输出、移除过早的上下文。
- **压缩（Compaction）**：LLM 驱动的摘要。将旧消息压缩为一条摘要消息，保留近期消息。追踪被压缩消息中的文件操作。
- **归档（Archive）**：将压缩产物持久化到长期存储。

### PersistentMemory（persistent-memory.ts）

加载和管理持久化的长期记忆：
- **全局记忆**：`~/.vitamin/AGENTS.md`（用户级）
- **项目记忆**：`.vitamin/AGENTS.md`（项目级）
- **社区记忆**：`.github/copilot-instructions.md`（社区兼容）
- 支持 frontmatter 提取和 Markdown 解析
- 构建 `MemoryContext`（memories + agentInstructions）

### Token 估算器（token-estimator.ts）

`TokenEstimator` 提供快速 token 数估算：
- `estimate(text)`：`text.length / 4` 的近似估算
- `estimateMessages(messages)`：递归估算消息数组总 token
- 用于触发压缩/修剪的阈值判断

### 经验学习（operational-learning-store.ts）

`OperationalLearningStore` 管理 Agent 的经验教训：
- `add(lesson)`：添加经验条目
- `get(query)`：按相关性检索
- `getRecentLessons(n)`：获取最近 N 条
- 持久化到 `.vitamin/lessons.json`

### 文件状态管理器（file-state-manager.ts）

`FileStateManager` 追踪工作空间快照：
- 记录压缩时的文件操作（创建、修改、删除）
- 在摘要中保留文件变更上下文
- 支持增量比对

### 压缩 Prompt 模板（prompts/）

提供用于 LLM 摘要的 prompt 模板，指导压缩行为：
- 保留关键决策和上下文
- 追踪文件变更
- 维护任务进度

## 实现流程

```
消息历史更新
     |
  TokenEstimator.estimateMessages(messages)
     |
  超过修剪阈值? --> Prune（移除冗余、截断输出）
     |
  超过压缩阈值? --> Compaction:
     |               |
     |          提取旧消息 + 文件操作
     |               |
     |          调用 summarize 回调 (LLM)
     |               |
     |          生成摘要消息 + FileState
     |               |
     |          Archive（持久化到存储）
     |
  返回更新后的消息列表

持久记忆加载：
  PersistentMemory.load()
       |
  扫描全局 / 项目 / 社区 AGENTS.md
       |
  提取 frontmatter + Markdown 内容
       |
  合并为 MemoryContext
```

## 模块分层

| 文件 | 职责 |
|------|------|
| `src/types.ts` | MemoryContext / CompactionResult / Lesson 等类型 |
| `src/memory-manager.ts` | 管线协调（prune → compaction → archive） |
| `src/persistent-memory.ts` | AGENTS.md 多源记忆加载 |
| `src/token-estimator.ts` | 快速 token 估算 |
| `src/operational-learning-store.ts` | 经验学习存储 |
| `src/file-state-manager.ts` | 文件变更追踪 |
| `src/archive/` | 归档存储（Memory / Local / HTTP） |
| `src/prompts/` | LLM 压缩模板 |
| `src/index.ts` | barrel 导出 |

## 入口与依赖

- **入口**：`src/index.ts`
- **内部依赖**：`@vitamin/persistence`、`@vitamin/shared`、`@vitamin/env`、`@vitamin/invariant`
- **外部依赖**：无

## 测试策略

- 测试文件数：6
- 覆盖：压缩管线、持久记忆加载、token 估算、经验存储、文件状态追踪
