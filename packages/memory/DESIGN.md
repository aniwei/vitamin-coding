# @vitamin/memory 设计说明

## 设计目标

- 管理 Agent 的工作记忆：上下文压缩（Compaction）、消息裁剪（Prune）、持久化记忆注入、归档。
- 在 context window 接近满载时，通过 LLM 摘要+裁剪策略维持 Agent 的持续工作能力。
- 分离"短期工作记忆"（当前会话消息）和"长期持久记忆"（AGENTS.md 等知识文件）的管理。
- 提供多层次记忆（LayeredMemoryStore）、语义检索（SemanticRetrieval）和经验学习（OperationalLearning）的扩展能力。

## 非目标

- 不直接持久化会话消息（由 `@vitamin/session` / `@vitamin/persistence` 负责）。
- 不实现 LLM 摘要调用本身（由调用方注入 `summarize` 函数）。

## 实现原理

### 内存管理器（memory-manager.ts）

`MemoryManager` 是短期记忆管理的核心协调器：

**构造参数**：

```typescript
{
  sources?: MemorySource[]       // 长期记忆来源（文件路径 + 是否可写）
  memoryStore?: MemoryStore      // 持久化存储后端（默认 FileSystemMemoryStore）
  compaction?: CompactionConfig  // 压缩配置
  prune?: PruneConfig            // 裁剪配置
  archiveStorage?: ArchiveStorage // 归档存储（默认 InMemoryArchiveStorage）
  summarize: (...) => Promise<string>  // LLM 摘要函数（必须由宿主注入）
  estimateTokens?: (text: string) => number  // token 估算函数
  model?: { contextWindow, maxOutput }       // 模型规格（计算阈值用）
}
```

**核心方法**：

- `loadMemory()` → 加载所有知识 sources 到内存
- `getMemoryPrompt()` → 返回格式化的 memory 注入文本（用于 system prompt）
- `needsCompaction(messages)` / `needsPrune(messages)` → 基于 token 估算判断是否触发
- `prepareCompaction(messages)` → 计算切点（CutPoint），分离"待摘要消息"和"保留消息"
- `compact(preparation)` → 调用注入的 `summarize()` 生成摘要，可选归档原始消息
- `prune(messages)` → 无 LLM 裁剪：删除旧 ToolCall 输出、截断过长输出

### 压缩策略（compaction.ts）

**触发条件（needsCompaction）**：

- 估算当前消息总 token 超过 `contextWindow × compactionConfig.trigger`（默认 0.85）

**切点计算（findCutPoint → prepareCompaction）**：

```
从消息列表末尾向前搜索，找到满足以下条件的切点：
1. 保留最后 N 个 token（keepRecent，默认 context 的 15%）
2. 切点必须在完整轮次边界（不切分一个 user/assistant/tool_result 组）
3. 记录 isSplitTurn（是否恰好切到轮次中间）
```

**摘要生成（compact）**：

```typescript
const prompt = buildCompactionPrompt(
  messagesToSummarize, // 待摘要消息
  previousSummary, // 前一次摘要（链式摘要）
  turnPrefixMessages, // 当前轮次的前缀消息
  memoryManager.getMemoryPrompt(), // 注入 memory 内容
  fileOps, // 涉及文件操作列表
)
const summary = await summarize(prompt)
// summary 替换 messagesToSummarize，保留 preservedMessages
```

**链式摘要**：每次压缩保存 `previousSummary`，下次压缩时作为上下文传入，形成递进式摘要链。

### 裁剪策略（prune.ts）

无 LLM 参与的轻量消息裁剪：

1. 按 `protectedTools` 保护最近 N 条特定工具的输出
2. 按 `truncateTools` 截断指定工具输出到 `truncateMaxLength` 字节
3. 从头部移除最旧消息，直到 token 低于 `protect` 阈值
4. 保证至少保留 `minimum` 条消息（防止过度裁剪）

### 持久化记忆（persistent-memory.ts）

`PersistentMemory` 管理长期知识文件（AGENTS.md、自定义 memory 文件）：

- `load()` → 通过 `MemoryStore` 加载所有 `sources` 定义的文件
- `getInjection()` → 格式化为 `<memory>...</memory>` XML 块供 system prompt 注入
- `getMemories()` → 返回原始 `Map<path, content>`
- `write(path, content)` → 向可写 source 写入更新（Agent 学习写回）

**FileSystemMemoryStore**：基于文件系统，支持 `watch()` 文件变更回调。

**内存 MemoryStore**：用于测试，所有内容存于 Map。

### 归档（archive.ts）

`ArchiveStorage` 接口：将压缩前的原始消息序列化后归档（支持按 sessionId 分组），便于事后审计和检索。

- `InMemoryArchiveStorage`：开发/测试用，存于内存 Map。
- `PersistenceArchiveStorage`（persistence-archive-storage.ts）：基于 `@vitamin/persistence` 持久化到磁盘。

### Token 估算（token-estimator.ts）

`estimateTokens(text)` 基于 `text.length / 4` 的快速估算（无需实际 tokenizer）；`estimateMessagesTokens(messages)` 遍历所有消息内容估算总 token 数。

### 分层记忆（layered-memory.ts）

`LayeredMemoryStore` 支持多层次记忆管理（如工作层/会话层/全局层），按层次查询和写入，高层优先，自动同步变更到下层持久化。

### 语义检索（semantic-retrieval.ts）

基于向量相似度检索历史 memory 条目：

- `retrieveRelevantMemories(query, config)` → 返回与当前 query 最相关的 N 条历史记忆。
- `buildInjectionFromRetrieved(entries)` → 格式化为注入文本。

### 经验学习（operational-learning.ts）

`OperationalLearningStore` 记录和读取 Agent 运行期的经验教训：

- 会话结束时触发 `extractAndSave(messages)` 从对话中提取有价值的经验。
- 下次会话时通过 `getInjection()` 注入历史经验到提示中。

## 调用链路

### 压缩触发流程

```
AgentSession 的 transformContext 函数（被 workLoop 调用）
       │
  HookRegistry.execute('messages.transform', { messages }, output)
       │
  AutoCompactionHook（coding/hooks/auto-compaction.ts）
       │
  memoryManager.needsCompaction(messages)?
    否 → 无操作
    是 ↓
  memoryManager.needsPrune(messages)?
    是 → memoryManager.prune(messages) → 快速裁剪
    否 ↓
  memoryManager.prepareCompaction(messages) → CompactionPreparation
       │
  emit(hookRegistry, 'compaction.before', preparation)
       │
  memoryManager.compact(preparation, sessionId)
       │
  1. buildCompactionPrompt(...)
  2. summarize(prompt)  ← 注入的 LLM 函数
  3. archive(originalMessages, summary)  ← 可选归档
  4. 返回 CompactionResult { summary, firstKeptIndex }
       │
  output.messages = [summaryMessage, ...preservedMessages]
       │
  emit(hookRegistry, 'compaction.after', result)
```

### 长期记忆注入流程

```
AgentSession.run() 前
       │
  memoryManager.loadMemory()
       │
  PersistentMemory.load()
       │
  MemoryStore.load(sources) → Map<path, content>
       │
  memoryManager.getMemoryPrompt() → <memory>...</memory> 字符串
       │
  注入到 systemPrompt（由 environment-injection hook 或 VitaminApp 完成）
```

## 模块分层

| 文件                                 | 职责                                           |
| ------------------------------------ | ---------------------------------------------- |
| `src/types.ts`                       | 所有核心类型（Config / Result / Storage 接口） |
| `src/memory-manager.ts`              | 短期记忆管理协调器                             |
| `src/compaction.ts`                  | 压缩触发检测 + 切点算法 + 摘要生成             |
| `src/prune.ts`                       | 无 LLM 轻量裁剪                                |
| `src/persistent-memory.ts`           | 长期记忆文件加载、格式化、写回                 |
| `src/archive.ts`                     | 内存归档存储                                   |
| `src/persistence-archive-storage.ts` | 磁盘归档（基于 @vitamin/persistence）          |
| `src/token-estimator.ts`             | 快速 token 数量估算                            |
| `src/defaults.ts`                    | 按模型规格计算默认压缩/裁剪阈值                |
| `src/prompts.ts`                     | 压缩 prompt 构建、归档引用格式化               |
| `src/layered-memory.ts`              | 多层次记忆管理                                 |
| `src/semantic-retrieval.ts`          | 向量语义检索                                   |
| `src/memory-extraction.ts`           | 从对话中提取经验教训                           |
| `src/operational-learning.ts`        | 经验教训存储与注入                             |
| `src/file-state-snapshot.ts`         | 文件状态快照（Capture/Restore）                |
| `src/state-restoration.ts`           | 会话文件状态恢复                               |
| `src/index.ts`                       | barrel 导出                                    |

## 入口与依赖

- **入口**：`src/index.ts`
- **内部依赖**：`@vitamin/ai`（Message 类型）、`@vitamin/persistence`、`@vitamin/shared`、`@vitamin/env`
- **外部依赖**：无

## 测试策略

- 测试文件数：10+
- 覆盖：Token 估算、切点算法、裁剪策略、压缩配置、Archive 存储、记忆加载/注入。

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

| 文件                                | 职责                                             |
| ----------------------------------- | ------------------------------------------------ |
| `src/types.ts`                      | MemoryContext / CompactionResult / Lesson 等类型 |
| `src/memory-manager.ts`             | 管线协调（prune → compaction → archive）         |
| `src/persistent-memory.ts`          | AGENTS.md 多源记忆加载                           |
| `src/token-estimator.ts`            | 快速 token 估算                                  |
| `src/operational-learning-store.ts` | 经验学习存储                                     |
| `src/file-state-manager.ts`         | 文件变更追踪                                     |
| `src/archive/`                      | 归档存储（Memory / Local / HTTP）                |
| `src/prompts/`                      | LLM 压缩模板                                     |
| `src/index.ts`                      | barrel 导出                                      |

## 入口与依赖

- **入口**：`src/index.ts`
- **内部依赖**：`@vitamin/persistence`、`@vitamin/shared`、`@vitamin/env`、`@vitamin/invariant`
- **外部依赖**：无

## 测试策略

- 测试文件数：6
- 覆盖：压缩管线、持久记忆加载、token 估算、经验存储、文件状态追踪
