# @vitamin/memory DESIGN

这份文档描述 `@vitamin/memory` 当前源码已实现的技术设计，聚焦运行时行为、分层边界、算法细节与扩展点。

## 1. 设计目标

- 提供多层记忆能力：
  - L1 持久化知识注入（`AGENTS.md` 类知识）
  - L2 上下文优化（`prune` + `compaction`）
  - L3 历史归档（内存 / 文件 / HTTP / persistence）
- 在长会话下控制上下文 token 增长，尽量减少模型上下文溢出风险。
- 保持组件可替换：摘要模型、token 估算器、存储后端均可注入。

## 2. 非目标

- 不负责消息会话本身的持久化与分支管理（由 `@vitamin/session` 等模块负责）。
- 不内置具体 LLM SDK；摘要能力通过 `summarize(prompt, options)` 回调注入。
- 不保证精确 tokenizer 统计，默认只提供轻量近似估算。

## 3. 模块边界与分层

```text
                        +------------------------------+
                        |         MemoryManager        |
                        |  process/load/list/read API  |
                        +---------------+--------------+
                                        |
              +-------------------------+-------------------------+
              |                                                   |
   +----------v-----------+                            +----------v-----------+
   | L1 PersistentMemory  |                            | L2 Context Optimizer |
   | load/getInjection    |                            | prune + compaction   |
   +----------+-----------+                            +----------+-----------+
              |                                                   |
   +----------v-----------+                            +----------v-----------+
   | MemoryStore          |                            | summarize callback   |
   | file/in-memory/...   |                            | token estimator      |
   +----------------------+                            +----------+-----------+
                                                                |
                                                     +----------v-----------+
                                                     | L3 Archive Storage   |
                                                     | memory/file/http/    |
                                                     | persistence-backed   |
                                                     +----------------------+
```

## 4. 关键类型

`src/types.ts` 定义了模块契约，核心包括：

- `ContextSize`: `['tokens', number] | ['messages', number] | ['fraction', number]`
- `PruneConfig` / `CompactionConfig`: 上下文优化策略配置
- `CompactionPreparation` / `CompactionResult`: 压缩阶段输入输出
- `MemoryStore`: L1 存储抽象（`load/write/watch?`）
- `ArchiveStorage`: L3 归档抽象（`archive/read/list`）
- `MemoryManagerConfig`: 统一装配入口

## 5. 运行时主流程

### 5.1 加载持久化知识（L1）

1. `MemoryManager.loadMemory()` 调用 `PersistentMemory.load()`。
2. `PersistentMemory` 通过 `MemoryStore.load(sources)` 加载多个 source。
3. 上层通过 `MemoryManager.getMemoryPrompt()` 获取 `<agent_memory>` 注入文本。

默认 source 优先级：

1. `~/.vitamin/AGENTS.md`（可写）
2. `./.vitamin/AGENTS.md`（可写）
3. `./AGENTS.md`（只读）

### 5.2 消息处理主流程（L2 + L3）

`MemoryManager.process(messages, sessionId?, signal?)` 分两阶段：

1. `prune`：当达到触发阈值时，先进行轻量无 LLM 裁剪。
2. `compaction`：若仍达到压缩阈值，执行摘要压缩；如提供 `sessionId`，同时归档被压缩消息。

处理完成后返回：

- `messages`: 处理后的消息列表
- `summary` / `archivePath`: 压缩产物
- `pruned` / `compacted`: 阶段状态

## 6. L2 算法细节

### 6.1 Token 估算

默认估算器：`estimateTokens(text) = ceil(text.length / 4)`。

- `estimateMessageTokens` 为每条消息额外加 `roleOverhead = 4`。
- `estimateMessagesTokens` 对消息列表求和。
- `estimateContextTokens` 优先复用最后一条 assistant usage：
  - 基线：`inputTokens + outputTokens`
  - 再叠加 usage 之后尾部消息的估算值

### 6.2 Prune

实现位于 `src/prune.ts`，策略如下：

1. 若 `currentTokens < trigger`，直接返回原消息。
2. 从尾部累积 token，计算保护边界 `protectBoundary`。
3. 在保护边界之前：
   - 对 `tool_result`：将大输出替换为占位文本（小于 100 tokens 不裁剪）。
   - 对 assistant 的 `tool_call`：若工具名命中 `truncateTools` 且参数过长，截断参数。
4. 计算 `tokensSaved`，若小于 `minimum`，回滚到原消息。

关键点：

- `protectedTools` 可阻止指定工具输出被裁剪。
- 这是无 LLM 的低成本降载阶段，目标是先释放上下文空间。

### 6.3 Compaction

实现位于 `src/compaction.ts`，分三步：

1. `findCutPoint`：
   - 从尾部保留 `keepRecent` 对应 token。
   - 切点向后调整到 `user/assistant` 边界，避免落在 `tool_result`。
   - 识别是否切在 turn 中间（split turn）。
2. `prepareCompaction`：
   - 切分 `messagesToSummarize` 与 `preservedMessages`。
   - 如 split turn，额外生成 `turnPrefixMessages`。
   - 提取历史文件操作（read/modified）。
3. `compact`：
   - 组装摘要 prompt（首次/增量两种模板）。
   - 调用 `summarize` 生成摘要。
   - 可追加文件操作清单。
   - split turn 时追加 turn prefix 摘要。

## 7. L3 归档设计

### 7.1 `ArchiveStorage` 抽象

统一接口：

- `archive(sessionId, messages, summary) => archivePath`
- `read(archivePath) => content`
- `list(sessionId) => ArchiveEntry[]`

### 7.2 内置实现

- `InMemoryArchiveStorage`
  - 路径形式：`memory://archives/{sessionId}/compaction-{timestamp}.md`
- `LocalArchiveStorage`
  - 写入 `{baseDir}/{sessionId}/compaction-{timestamp}.md`
- `HttpArchiveStorage`
  - API 约定：
    - `POST /archives/{sessionId}`
    - `GET /archives/content?path=...`
    - `GET /archives/{sessionId}`
- `PersistenceBackedArchiveStorage`
  - 通过 `@vitamin/persistence` 保存 snapshot
  - id 形式：`{sessionId}/compaction-{timestamp}`

### 7.3 归档内容格式

`formatArchive` 产出 Markdown：

- 压缩时间
- 摘要正文
- 原始消息列表（单条内容最长截断到 2000 字符）

## 8. 默认配置与阈值

默认值由 `@vitamin/env` 提供，`src/defaults.ts` 负责组装：

- Compaction:
  - trigger: `0.85 * contextWindow`
  - keepRecent: `0.10 * contextWindow`
  - reserveTokens: `min(16384, model.maxOutput)`（传入 model 时）
- Prune:
  - trigger: `0.70 * contextWindow`
  - protect: `0.15 * contextWindow`
  - minimum: `20000`
  - truncateMaxLength: `2000`

## 9. 扩展点

- `summarize(prompt, options)`：替换为任意 LLM 摘要实现。
- `estimateTokens(text)`：可注入准确 tokenizer。
- `MemoryStore`：可接对象存储、远端 KV、数据库。
- `ArchiveStorage`：可接企业归档服务。
- `createPersistenceArchiveStorage`：直接复用 persistence 生态。

## 10. 失败与降级策略

- `archive` 失败不会中断 compaction，日志告警后继续返回摘要结果。
- 文件型 memory source 不存在时，`FileSystemMemoryStore.load` 直接跳过。
- `prune` 节省不足 `minimum` 时自动回滚。
- `prepareCompaction` 在消息过少或无可压缩段时返回 `null`。
- `readArchive` 在路径不存在时抛错，交由调用方处理。

## 11. 状态与生命周期

- `MemoryManager` 内部持有 `previousSummary`，用于增量压缩上下文。
- `dispose()` 会释放 L1 监听与内存缓存。
- `PersistentMemory.startWatching()` 依赖 store 实现 `watch`；未实现时为 no-op。

## 12. 已知约束

- 默认 token 估算为字符近似，不适合作为计费精算。
- `extractFileOps` 目前只基于 `tool_result` 文本正则提取路径，可能漏检相对路径或无扩展名路径。
- `LocalArchiveStorage.list()` 仅靠文件名和 stat 构建条目，`summary/messageCount` 不回填正文信息。
- `ContextSize` 虽支持 `messages` 单位，但当前优化流程以 token 比较为主，生产接入建议优先使用 `tokens/fraction`。

## 13. 测试现状

当前 `packages/memory/tests` 主要覆盖 `PersistenceBackedArchiveStorage`：

- 归档、读取、过滤、排序、摘要截断
- 工厂函数创建逻辑

`prune`、`compaction`、`memory-manager` 目前尚未在该包内提供对应测试用例，建议后续补齐端到端覆盖。