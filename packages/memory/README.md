# @vitamin/memory

多层记忆管理系统：持久化知识（AGENTS.md）、会话内上下文压缩（Compaction）、跨会话摘要恢复。

## 包结构

```
packages/memory/
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── README.md
└── src/
    ├── index.ts               # 导出清单
    ├── types.ts               # 核心类型定义
    ├── memory-manager.ts      # MemoryManager 统一入口
    ├── persistent-memory.ts   # L1: AGENTS.md 持久化知识
    ├── prune.ts               # L2 Phase 1: 无 LLM 裁剪
    ├── compaction.ts          # L2 Phase 2: LLM 摘要 + 切点算法
    ├── archive.ts             # L3: 历史归档存储
    ├── defaults.ts            # Model-aware 默认配置
    ├── prompts.ts             # 摘要 Prompt 模板
    └── token-estimator.ts     # Token 估算工具
```

---

## 竞品分析

### 三大开源项目 Memory 实现对比

| 维度 | pi-mono (27.9k★) | opencode (130k★) | deepagents (17.4k★) |
|---|---|---|---|
| **语言/框架** | TypeScript | TypeScript (Effect) | Python (LangGraph) |
| **记忆类型** | 会话内 Compaction | 会话内 Compaction + Prune | 持久 Memory + 会话 Summarization |
| **持久化知识** | 无独立机制 | 无独立机制 | AGENTS.md 文件系统 |
| **压缩触发** | token 超出 contextWindow - reserveTokens | token 超出 model.limit.input - reserved | fraction / tokens / messages 三种阈值 |
| **压缩策略** | LLM 生成结构化摘要 (Goal/Progress/Decisions) | LLM 生成结构化摘要 (Goal/Instructions/Discoveries/Accomplished) | LLM 摘要 + 历史 offload 到文件 |
| **多次压缩** | 迭代式 — 新摘要合并旧摘要 (UPDATE_SUMMARIZATION_PROMPT) | 迭代式 — 带 replay 回溯 + prune 修剪 | 迭代式 — 保存摘要事件链，offload 历史到 markdown |
| **工具参数裁剪** | ❌ | ✅ prune (擦除旧 tool call 输出) | ✅ truncate_args (裁剪 write_file/edit_file 等大参数) |
| **手动压缩** | ❌ | ❌ | ✅ compact_conversation 工具 |
| **分支感知** | ✅ branchWithSummary | ❌ | ❌ |
| **切点算法** | 双向扫描 — 倒序累积 token 找切点 + 保证 user/assistant 边界 | 全量 prune + LLM 摘要 | partition — cutoff_index 切分 + 保留尾部消息 |
| **历史恢复** | ❌ 旧消息丢弃（仅摘要留存） | ❌ 旧消息丢弃 | ✅ offload 到 /conversation_history/{thread_id}.md |
| **System Prompt 注入** | 摘要作为 compactionSummary 角色消息 | 摘要作为 assistant.summary 消息 | 摘要作为 HumanMessage + system prompt 引导 |
| **配置复杂度** | 简单 (3 参数) | 中等 (auto/prune/reserved) | 丰富 (trigger/keep/truncate 均可独立配) |

### 详细机制分析

#### pi-mono: Session + Compaction

pi-mono 的记忆 = **Session 树 + Compaction 机制**：

- **Session 树 (JSONL)**: 所有消息以 append-only 树结构存储，支持 branch / fork / navigate
- **Compaction 压缩**: 当 token 超过 `contextWindow - reserveTokens` 时触发
  - 使用 `findCutPoint()` 从尾部倒序扫描，找到保留 `keepRecentTokens` 的切点
  - 切点必须在 user / assistant 消息边界（不在 toolResult 处切）
  - 支持 **split turn** — 如果切在 turn 中间，生成 turn prefix 摘要
  - 摘要通过 LLM 生成，包含 Goal / Constraints / Progress / Key Decisions / Next Steps / Critical Context
  - **迭代压缩**: 如果已有压缩摘要，使用 UPDATE_SUMMARIZATION_PROMPT 增量更新
  - 压缩结果追加文件尾部的 readFiles / modifiedFiles 列表
- **无持久化知识**: 没有独立的 AGENTS.md / Memory 文件机制

**优点**: 切点算法精确，分支感知好，摘要模板结构化
**缺点**: 无跨会话记忆，无历史恢复，无手动压缩

#### opencode: Compaction + Prune 双层优化

opencode 的记忆 = **Compaction 摘要 + Prune 修剪** 双层策略：

- **Compaction 摘要**: 当 token 溢出时触发，用独立 "compaction" agent 生成摘要
  - 摘要模板: Goal / Instructions / Discoveries / Accomplished / Relevant files
  - 支持插件注入 compaction context / 替换 compaction prompt
  - 支持 overflow 场景 — 如果媒体附件过大导致溢出，strip media 后 replay
- **Prune 修剪**: 轻量级预处理
  - 从尾部倒序扫描，保留最近 40,000 token 的 tool call 输出
  - 超过 40,000 token 后，将更早的 tool call output 标记为 `compacted`（清空输出）
  - "skill" 类型 tool 受保护不被 prune
  - 最少 prune 20,000 token 才生效（避免频繁小幅修剪）
- **无持久化知识**: 通过 `.opencode/` 配置目录管理项目设置，但无 AGENTS.md 记忆机制

**优点**: Prune + Compaction 双层，prune 轻量快速无需 LLM 调用
**缺点**: 无跨会话记忆，无手动压缩工具

#### deepagents: Memory + Summarization 分层架构

deepagents 是三者中 **记忆架构最完整** 的：

- **Memory 中间件 (MemoryMiddleware)**: 持久化知识
  - 从 AGENTS.md 文件加载 project context，注入 system prompt
  - 多 source 按序加载合并（如 `~/.deepagents/AGENTS.md` + `./.deepagents/AGENTS.md`）
  - Agent 可通过 `edit_file` 工具 **主动写回** AGENTS.md（学习反馈、偏好、模式）
  - 详细的 memory guidelines: 什么时候该记、什么时候不该记
  - 通过 `<agent_memory>` + `<memory_guidelines>` 标签包裹注入 system prompt
- **Summarization 中间件 (SummarizationMiddleware)**: 会话内压缩
  - 三种触发模式: `("tokens", N)` / `("messages", N)` / `("fraction", F)`
  - **历史 offload**: 被压缩的消息 offload 到 `/conversation_history/{thread_id}.md`
  - 摘要消息包含 offload 文件路径，Agent 可以回溯查看完整历史
  - **工具参数裁剪**: 独立阈值控制，裁剪 write_file / edit_file 等大参数
  - **手动压缩工具**: `compact_conversation` tool 让 Agent 或用户主动压缩
    - 50% 自动触发阈值时才允许手动压缩（防止过早压缩）
  - 基于 LangGraph `Command` 更新 state，与 checkpoint 机制天然集成
- **model-aware defaults**: 根据模型 profile 自动计算 trigger / keep / truncate 参数

**优点**: 分层明确，持久化 + 会话内完整覆盖，Agent 可自主学习写回
**缺点**: Python-only，依赖 LangGraph 生态

### 关键设计洞察

| 洞察 | 说明 |
|---|---|
| **分层是必须的** | deepagents 证明了 "持久化知识" 和 "会话压缩" 是两个独立关注点，必须分层 |
| **Prune 是低成本预处理** | opencode 的 prune 不需要 LLM 调用，是 compaction 前的有效优化 |
| **Agent 应能写回知识** | deepagents 的 Agent 通过 edit_file 主动学习并写回 AGENTS.md，实现真正的 "记忆" |
| **历史可恢复很重要** | deepagents offload 到文件让 Agent 可以回溯完整历史，pi-mono / opencode 丢弃不可逆 |
| **手动压缩是好设计** | 让 Agent/用户在合适时机主动压缩，而非完全依赖被动触发 |
| **切点精度影响质量** | pi-mono 的 turn-boundary-aware 切点算法比简单的 message count 切点更好 |
| **摘要模板应结构化** | 三个项目都使用结构化模板（Goal/Progress/Decisions），避免摘要遗漏关键信息 |

---

## Vitamin Memory 设计方案

### 设计目标

基于竞品分析，Vitamin Memory 采用 **三层记忆架构**，取各家之长：

| 层级 | 名称 | 对标 | 说明 |
|---|---|---|---|
| L1 | **Persistent Memory** | deepagents MemoryMiddleware | 持久化知识文件（AGENTS.md / .vitamin/memory/） |
| L2 | **Compaction** | pi-mono + opencode | 会话内消息压缩（Prune + Summarize） |
| L3 | **History Archive** | deepagents offload | 被压缩消息的归档与恢复 |

### 架构总览

```
┌──────────────────────────────────────────────────────────────────────┐
│                         @vitamin/coding                              │
│                         AgentSession                                 │
│   ┌───────────────────────────────────────────────────────────────┐  │
│   │                     @vitamin/memory                           │  │
│   │                     MemoryManager                             │  │
│   │  ┌──────────────┐  ┌─────────────────┐  ┌─────────────────┐  │  │
│   │  │ L1 Persistent│  │ L2 Compaction   │  │ L3 Archive      │  │  │
│   │  │ Memory       │  │ Prune+Summarize │  │ History Offload │  │  │
│   │  └──────┬───────┘  └────────┬────────┘  └────────┬────────┘  │  │
│   │         │                   │                     │           │  │
│   │         ▼                   ▼                     ▼           │  │
│   │  ┌─────────────┐   ┌──────────────┐     ┌────────────────┐   │  │
│   │  │ MemoryStore │   │ @vitamin/    │     │ ArchiveStorage │   │  │
│   │  │ (AGENTS.md) │   │  session     │     │ (Markdown)     │   │  │
│   │  └─────────────┘   └──────────────┘     └────────────────┘   │  │
│   └───────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
```

### L1 — Persistent Memory (持久化知识)

#### 核心理念

> Agent 不仅能 **读取** 项目知识，还能 **写回** 从交互中学到的内容。

#### MemorySource — 知识来源

```ts
interface MemorySource {
  /** 文件路径（支持 ~ 展开） */
  path: string
  /** 是否可写（Agent 是否可以 edit_file 写回） */
  writable: boolean
}
```

默认 sources（按加载顺序）:

```ts
const DEFAULT_MEMORY_SOURCES: MemorySource[] = [
  // 全局用户偏好
  { path: '~/.vitamin/AGENTS.md', writable: true },
  // 项目级知识
  { path: './.vitamin/AGENTS.md', writable: true },
  // 社区标准 agents.md (只读)
  { path: './AGENTS.md', writable: false },
]
```

#### MemoryStore — 知识存储

```ts
interface MemoryStore {
  /** 加载所有 sources 的内容 */
  load(sources: MemorySource[]): Promise<Map<string, string>>

  /** 写入指定 source（仅 writable=true 的 source 允许） */
  write(path: string, content: string): Promise<void>

  /** 监听文件变更（可选，支持热重载） */
  watch?(sources: MemorySource[], onChange: (path: string) => void): () => void
}
```

内置实现:

| 实现 | 说明 |
|---|---|
| `FileSystemMemoryStore` | 基于文件系统读写，默认实现 |
| `InMemoryMemoryStore` | 纯内存，用于测试 |

#### System Prompt 注入

Memory 内容通过结构化标签注入 system prompt:

```xml
<agent_memory>
# ~/.vitamin/AGENTS.md
[用户全局偏好内容]

# ./.vitamin/AGENTS.md
[项目知识内容]
</agent_memory>

<memory_guidelines>
当你从交互中学到应该记住的信息时，使用 edit_file 工具写回对应的 AGENTS.md 文件。

**应该记住的**:
- 用户明确要求记住的偏好/约束
- 从反馈中学到的模式（代码风格、架构偏好）
- 工具使用的关键参数（API endpoint、账号信息等非敏感类）
- 项目特有的构建/测试命令

**不应该记住的**:
- 临时性任务信息
- 一次性问答
- API 密钥、密码等敏感信息
- 寒暄/确认类对话
</memory_guidelines>
```

### L2 — Compaction (会话内压缩)

#### 双层策略: Prune + Summarize

借鉴 opencode 的双层设计，结合 pi-mono 的切点精度:

```
[消息列表] → Prune (轻量裁剪) → Summarize (LLM 摘要) → [压缩后列表]
```

##### Phase 1: Prune (无需 LLM)

裁剪旧 tool call 的输出，保留最近的完整输出:

```ts
interface PruneConfig {
  /** 触发 prune 的 token 阈值 */
  trigger: ContextSize
  /** 保留最近的消息不被 prune */
  protect: ContextSize
  /** 最少需要裁剪多少 token 才执行（避免频繁小幅修剪） */
  minimum: number
  /** 受保护不被 prune 的 tool 类型 */
  protectedTools: string[]
}
```

Prune 策略:
1. 从尾部倒序扫描消息
2. 保护最近 `protect` 范围内的 tool call 输出不动
3. 超出保护范围后，将旧 tool call 的 output 替换为 `[output pruned — {n} tokens]`
4. 特别裁剪 `write_file` / `edit_file` 等大参数（arguments 截断到前 20 字符 + `...(truncated)`）
5. 累计裁剪量不足 `minimum` 则不执行（避免频繁触发）

##### Phase 2: Summarize (LLM 驱动)

当 Prune 后 token 仍超标，触发 LLM 摘要:

```ts
interface CompactionConfig {
  /** 是否启用自动压缩 */
  enabled: boolean
  /** 触发压缩的 token 阈值 */
  trigger: ContextSize
  /** 压缩后保留的最近 token 量 */
  keepRecent: ContextSize
  /** 为摘要预留的 token 空间 */
  reserveTokens: number
  /** 自定义摘要指令（追加到默认 prompt） */
  customInstructions?: string
}
```

#### ContextSize — 统一阈值类型

```ts
/** 统一的上下文大小度量方式 */
type ContextSize =
  | ['tokens', number]     // 绝对 token 数
  | ['messages', number]   // 消息条数
  | ['fraction', number]   // 占上下文窗口的比例 (0-1)
```

#### 切点算法 (CutPointFinder)

借鉴 pi-mono 的精确切点算法:

```ts
interface CutPoint {
  /** 第一个保留的 entry 索引 */
  firstKeptIndex: number
  /** 如果切在 turn 中间，turn 起始 entry 的索引 */
  turnStartIndex: number
  /** 是否切在 turn 中间 */
  isSplitTurn: boolean
}
```

切点规则:
1. 从尾部倒序累积 token，找到保留 `keepRecent` 的边界
2. 切点 **必须** 在 user / assistant 消息边界（不在 toolResult 处切）
3. 如果切在 turn 中间（assistant 消息处），生成 **turn prefix 摘要**
4. non-message entry（model_change / thinking_level_change 等）跟随其后的 message

#### 摘要模板

主摘要 (初次压缩):

```markdown
## Goal
[用户在尝试完成什么？]

## Constraints & Preferences
- [用户提到的约束、偏好、要求]

## Progress
### Done
- [x] [已完成的工作]
### In Progress
- [ ] [进行中的工作]

## Key Decisions
- **[决策]**: [简要理由]

## Next Steps
1. [下一步计划]

## File Operations
### Read
- [读取过的文件]
### Modified
- [修改过的文件]

## Critical Context
- [继续工作所需的关键信息]
```

增量更新 (迭代压缩):

当已有摘要存在时，使用 UPDATE prompt 增量合并新消息到已有摘要中:
- 保留所有已有信息
- 将 In Progress 完成的项目移到 Done
- 更新 Next Steps
- 保留精确的文件路径、函数名、错误信息

Turn Prefix 摘要 (切在 turn 中间时):

```markdown
## Original Request
[该 turn 的用户原始请求]

## Early Progress
- [前缀中完成的关键工作]

## Context for Suffix
- [理解保留后缀所需的上下文]
```

#### 手动压缩工具

提供 `compact_conversation` 工具让 Agent / 用户主动压缩:

```ts
interface CompactConversationTool {
  name: 'compact_conversation'
  description: '压缩对话历史，将旧消息摘要化以释放上下文窗口空间'
  /** 达到自动触发阈值的 50% 时才允许手动压缩 */
  eligibilityCheck: (tokenUsage: number, autoTrigger: number) => boolean
}
```

### L3 — History Archive (历史归档与恢复)

#### 核心理念

> 被压缩的消息不是"丢弃"，而是"归档"。Agent 可以按需回溯。

借鉴 deepagents 的 offload 机制:

```ts
interface ArchiveStorage {
  /** 归档被压缩的消息 */
  archive(sessionId: string, messages: AgentMessage[], summary: string): Promise<string>

  /** 读取归档内容（Agent 通过 read_file 工具访问） */
  read(archivePath: string): Promise<string>

  /** 列出某 session 的所有归档 */
  list(sessionId: string): Promise<ArchiveEntry[]>
}

interface ArchiveEntry {
  path: string
  timestamp: number
  messageCount: number
  summary: string
}
```

归档存储路径:

```
$VITAMIN_HOME/
└── agent/
    └── archives/
        └── <session-id>/
            └── compaction-<timestamp>.md
```

归档文件格式:

```markdown
## Compacted at 2026-03-26T10:00:00Z

### Summary
[LLM 生成的摘要]

### Original Messages (42 messages)
Human: ...
Assistant: ...
Human: ...
...
```

压缩时的摘要消息包含归档路径引用:

```
你正处于一个已被摘要化的对话中。
完整历史已保存至 archives/<session-id>/compaction-<timestamp>.md，
如需查看详细上下文可通过 read_file 工具访问。

<summary>
[摘要内容]
</summary>
```

### Model-Aware Defaults

根据模型 profile 自动计算合理默认值（借鉴 deepagents）:

```ts
interface MemoryDefaults {
  compaction: {
    trigger: ContextSize
    keepRecent: ContextSize
    reserveTokens: number
  }
  prune: {
    trigger: ContextSize
    protect: ContextSize
    minimum: number
  }
  truncateArgs: {
    trigger: ContextSize
    keep: ContextSize
    maxLength: number
  }
}

function computeMemoryDefaults(model: {
  contextWindow: number
  maxOutput: number
}): MemoryDefaults {
  const ctx = model.contextWindow
  const maxOut = model.maxOutput

  return {
    compaction: {
      trigger: ['fraction', 0.85],     // 85% 上下文窗口
      keepRecent: ['fraction', 0.10],   // 保留最近 10%
      reserveTokens: Math.min(16384, maxOut),
    },
    prune: {
      trigger: ['fraction', 0.70],     // 70% 开始 prune（先于 compaction）
      protect: ['fraction', 0.15],     // 保护最近 15%
      minimum: 20000,
    },
    truncateArgs: {
      trigger: ['fraction', 0.70],
      keep: ['fraction', 0.10],
      maxLength: 2000,
    },
  }
}
```

---

## 完整 API 设计

### MemoryManager — 统一入口

```ts
interface MemoryManagerConfig {
  /** L1 持久化知识 sources */
  sources?: MemorySource[]
  /** L1 知识存储后端 */
  memoryStore?: MemoryStore

  /** L2 压缩配置 */
  compaction?: Partial<CompactionConfig>
  /** L2 Prune 配置 */
  prune?: Partial<PruneConfig>
  /** L2 工具参数裁剪配置 */
  truncateArgs?: Partial<TruncateArgsConfig>

  /** L3 归档存储后端 */
  archiveStorage?: ArchiveStorage

  /** 摘要生成函数（由外部注入，解耦 Provider） */
  summarize: (
    prompt: string,
    options?: { maxTokens?: number; signal?: AbortSignal },
  ) => Promise<string>

  /** Token 计数函数 */
  estimateTokens?: (text: string) => number

  /** 模型信息（用于 model-aware defaults） */
  model?: { contextWindow: number; maxOutput: number }
}

class MemoryManager {
  constructor(config: MemoryManagerConfig)

  // ── L1 Persistent Memory ──

  /** 加载所有知识 sources 到内存 */
  loadMemory(): Promise<void>

  /** 获取格式化的 memory 文本（用于 system prompt 注入） */
  getMemoryPrompt(): string

  /** 重新加载（文件变更后调用） */
  reloadMemory(): Promise<void>

  // ── L2 Compaction ──

  /** 检查是否需要 prune */
  needsPrune(messages: AgentMessage[]): boolean

  /** 执行 prune（修剪旧 tool call 输出） */
  prune(messages: AgentMessage[]): PruneResult

  /** 检查是否需要 compaction */
  needsCompaction(messages: AgentMessage[]): boolean

  /** 准备 compaction（计算切点、分离消息） */
  prepareCompaction(messages: AgentMessage[]): CompactionPreparation | null

  /** 执行 compaction（生成摘要 + 归档） */
  compact(preparation: CompactionPreparation): Promise<CompactionResult>

  /** 手动压缩评估 — 达到 50% 自动阈值时允许 */
  isEligibleForManualCompact(messages: AgentMessage[]): boolean

  /**
   * 一键流程: prune → compaction → archive
   * 返回处理后的消息列表 + 摘要（如果发生压缩）。
   * 调用方（AgentSession）负责将结果写入 session。
   */
  process(messages: AgentMessage[], sessionId?: string, signal?: AbortSignal): Promise<{
    messages: Message[]
    summary?: string
    archivePath?: string
    pruned: boolean
    compacted: boolean
  }>

  // ── L3 Archive ──

  /** 获取当前 session 的归档列表 */
  listArchives(sessionId: string): Promise<ArchiveEntry[]>

  /** 读取归档内容 */
  readArchive(archivePath: string): Promise<string>
}
```

### Token 估算

```ts
/** 简单估算：每 4 字符约 1 token（偏保守） */
function estimateTokens(message: AgentMessage): number

/** 从 usage 元数据获取精确 token（如果可用） */
function getTokensFromUsage(message: AssistantMessage): number | null

/** 估算上下文总 token:
 * 1. 找到最后一条带 usage 的 assistant 消息
 * 2. 使用 usage.totalTokens 作为基准
 * 3. 估算 usage 之后的尾部消息 token
 * 4. 合计 = usage + trailing
 */
function estimateContextTokens(messages: AgentMessage[]): ContextTokenEstimate
```

### 核心数据结构

```ts
interface PruneResult {
  /** prune 后的消息列表 */
  messages: AgentMessage[]
  /** 被 prune 的 tool call 数量 */
  prunedCount: number
  /** 估算节省的 token 数 */
  tokensSaved: number
}

interface CompactionPreparation {
  /** 需要被摘要的消息 */
  messagesToSummarize: AgentMessage[]
  /** 切在 turn 中间时的 prefix 消息 */
  turnPrefixMessages: AgentMessage[]
  /** 保留的消息 */
  preservedMessages: AgentMessage[]
  /** 是否切在 turn 中间 */
  isSplitTurn: boolean
  /** 压缩前的 token 数 */
  tokensBefore: number
  /** 上一次压缩的摘要（用于迭代更新） */
  previousSummary?: string
  /** 提取的文件操作记录 */
  fileOps: { read: string[]; modified: string[] }
}

interface CompactionResult {
  /** 生成的摘要文本 */
  summary: string
  /** 第一个保留的 entry ID */
  firstKeptEntryId: string
  /** 压缩前的 token 数 */
  tokensBefore: number
  /** 归档文件路径（如果归档成功） */
  archivePath?: string
}

interface TruncateArgsConfig {
  /** 触发裁剪的 token 阈值 */
  trigger: ContextSize
  /** 保护最近的消息不裁剪 */
  keep: ContextSize
  /** 参数最大保留长度（字符） */
  maxLength: number
  /** 需要裁剪的 tool 名称列表 */
  tools: string[]
}
```

---

## Memory + Session 融合设计

### 核心问题

Memory 和 Session 有各自的持久化需求：

| 数据 | 当前归属 | 持久化需求 |
|---|---|---|
| 消息历史 | @vitamin/session | JSONL append-only 树 |
| 压缩摘要 (CompactionEntry) | @vitamin/session | 作为 session entry 存储 |
| 历史归档 (Archive) | @vitamin/memory | Markdown 文件 |
| 持久化知识 (AGENTS.md) | @vitamin/memory | 文件系统 (always local) |
| Token 估算 / 切点计算 | @vitamin/memory | 无持久化需求 |

**关键约束: session 和 memory 的持久化策略必须一致** — 如果 session 用本地存储，archive 也用本地；如果 session 用远程，archive 也用远程。

### 统一持久化策略: StorageConfig

Session 和 Memory 共享同一份 `StorageConfig`，由上层 `@vitamin/coding` 统一配置：

```
┌──────────────────────────────────────────────────────────────────────────┐
│                       @vitamin/coding                                    │
│                       VitaminApp                                         │
│                                                                          │
│   StorageConfig ─────────────────────────────────────────────┐           │
│   { type: 'local' | 'remote' | 'memory', ... }              │           │
│                                                               │           │
│   ┌───────────────────────────┐  ┌────────────────────────┐  │           │
│   │    @vitamin/session       │  │    @vitamin/memory      │  │           │
│   │                           │  │                         │  │           │
│   │  SessionStorage           │  │  ArchiveStorage         │  │           │
│   │  ├ LocalSessionStorage    │  │  ├ LocalArchiveStorage  │  │           │
│   │  ├ RemoteSessionStorage   │  │  ├ RemoteArchiveStorage │  │           │
│   │  └ MemorySessionStorage   │  │  └ InMemoryArchive     │  │           │
│   └───────────────────────────┘  └────────────────────────┘  │           │
│                                                               │           │
│   同一 StorageConfig 实例 ───────────────────────────────────┘           │
└──────────────────────────────────────────────────────────────────────────┘
```

```ts
// @vitamin/memory/src/types.ts
type StorageType = 'local' | 'remote' | 'memory'

type StorageConfig =
  | { type: 'local'; baseDir?: string }
  | { type: 'remote'; baseUrl: string; getAuth: () => Promise<{ token: string }>; timeout?: number; fetch?: typeof globalThis.fetch }
  | { type: 'memory' }
```

Session（在 @vitamin/session 中）和 Archive（在 @vitamin/memory 中）各自提供工厂函数，接受相同的 StorageConfig：

```ts
// @vitamin/session — 已有设计
function createSessionStorage(config: StorageConfig): SessionStorage

// @vitamin/memory — 新增
function createArchiveStorage(config: StorageConfig): ArchiveStorage
```

### 存储路径对齐

本地模式下，session 和 archive 的物理路径同根：

```
$VITAMIN_HOME/                       (默认 ~/.vitamin)
└── agent/
    ├── sessions/                    ← SessionStorage (JSONL)
    │   └── <encoded-cwd>/
    │       ├── 2026-03-26T10-00-00Z_abc.jsonl
    │       └── 2026-03-26T11-00-00Z_def.jsonl
    └── archives/                    ← ArchiveStorage (Markdown)
        └── <session-id>/
            ├── compaction-1711440000000.md
            └── compaction-1711443600000.md
```

远程模式下，archive API 和 session API 使用同一 baseUrl：

```
POST /sessions                → 创建会话
POST /sessions/:id/entries    → 追加 entry
POST /archives/:sessionId     → 创建归档
GET  /archives/:sessionId     → 列出归档
GET  /archives/content?path=  → 读取归档内容
```

### 数据流: Memory 如何写入 Session

Memory **不直接**写入 Session。Memory 负责计算和生成，Session 负责存储。中间由 `AgentSession`（在 @vitamin/coding 中）协调：

```
┌─────────────────────────────────────────────────────────────────────┐
│ AgentSession.prompt() — 每次 Agent 循环                             │
│                                                                     │
│  1. ctx = session.buildContext()                                    │
│     → { summary?: string, messages: AgentMessage[] }                │
│                        ↓                                            │
│  2. result = memoryManager.process(messages, sessionId)             │
│     ┌─────────────────────────────────────────────┐                 │
│     │ MemoryManager.process()                     │                 │
│     │  a. needsPrune? → prune()       → 裁剪消息  │                 │
│     │  b. needsCompaction? →                      │                 │
│     │     prepareCompaction() → 切点 + 分离消息   │                 │
│     │     compact()           → LLM 摘要          │                 │
│     │     archive()           → 归档旧消息 (L3)   │                 │
│     │  c. 返回处理结果:                            │                 │
│     │     { messages, summary, archivePath }       │                 │
│     └─────────────────────────────────────────────┘                 │
│                        ↓                                            │
│  3. if (result.compacted)                                           │
│       session.compact(result.summary, compactedCount)               │
│                        ↓                                            │
│  4. agent.run({ model, systemPrompt, tools,                        │
│       messages: result.messages })                                  │
│     → workLoop 就地修改 messages                                    │
│                        ↓                                            │
│  5. 新消息 → session.append(msg)                                    │
└─────────────────────────────────────────────────────────────────────┘
```

### Session 上下文重建与 Compaction

Session 的 `buildContext()` 已支持压缩边界：

```ts
// @vitamin/session — Session<T>.buildContext()
buildContext():
  1. 从后往前找最后一个 compaction 标记
  2. 有 compaction:
     a. summary = 该 compaction 的摘要文本
     b. messages = compaction 标记之后的所有消息
  3. 无 compaction: 返回全部消息
  4. 返回 { summary?, messages }
```

Memory 的 `MemoryManager.process()` 生成 compaction 数据后，AgentSession 调用 `session.compact(summary, count)` 将压缩标记写入 Session。下次调用 `buildContext()` 时，Session 会自动只返回摘要 + 压缩边界之后的消息。

**关键设计**: Memory 不需要维护自己的消息列表。Session 是唯一的消息源（Single Source of Truth），Memory 只做"读取 → 计算 → 输出"，不做存储。

### L1 Persistent Memory 与 Session 的关系

L1（AGENTS.md 持久化知识）始终基于文件系统，不受 StorageConfig 影响：

```ts
// 在 AgentSession 启动时
await memoryManager.loadMemory()

// 构建 system prompt 时注入
const systemPrompt = [
  baseSystemPrompt,
  memoryManager.getMemoryPrompt(),  // <agent_memory> + <memory_guidelines>
].join('\n\n')
```

AGENTS.md 的写回通过 Agent 的 `edit_file` 工具自然发生，不需要特殊机制。Memory 的 `<memory_guidelines>` 指导 Agent 何时写回、写到哪个文件。

### AgentSession 集成示例

```ts
// @vitamin/coding 中的 AgentSession
import { createMemoryManager, createArchiveStorage } from '@vitamin/memory'
import type { Session } from '@vitamin/session'
import type { Agent, AgentMessage } from '@vitamin/agent'

class AgentSession {
  private memoryManager: MemoryManager
  private session: Session<AgentMessage>
  private agent: Agent
  private model: Model
  private systemPrompt: string
  private tools: AgentTool[]

  async prompt(text: string): Promise<void> {
    // 1. 追加用户消息到 Session
    const userMessage: AgentMessage = {
      role: 'user',
      content: [{ type: 'text', text }],
    }
    this.session.append(userMessage)

    // 2. 从 Session 构建上下文
    const ctx = this.session.buildContext()
    const messages: AgentMessage[] = []
    if (ctx.summary) {
      messages.push({
        role: 'user',
        content: [{ type: 'text', text: `[Previous conversation summary]\n${ctx.summary}` }],
      })
    }
    messages.push(...ctx.messages)

    // 3. Memory 处理（prune → compact → archive）
    const processed = await this.memoryManager.process(messages, this.session.id)
    if (processed.compacted && processed.summary) {
      this.session.compact(processed.summary, /* compactedCount */)
    }

    const messagesBefore = processed.messages.length

    // 4. Agent 执行（无状态，每次传入完整上下文）
    await this.agent.run({
      model: this.model,
      systemPrompt: this.systemPrompt,
      tools: this.tools,
      messages: processed.messages,
    })

    // 5. 新消息持久化回 Session
    const newMessages = processed.messages.slice(messagesBefore)
    for (const msg of newMessages) {
      this.session.append(msg)
    }
  }
}
```

### 配置一致性保证

在 VitaminApp 层面，StorageConfig 只配置一次：

```ts
// @vitamin/coding — VitaminApp
class VitaminApp {
  private storageConfig: StorageConfig

  constructor(options: VitaminAppOptions) {
    this.storageConfig = options.storage ?? { type: 'local' }
  }

  async createSession(options?: AgentSessionOptions): Promise<AgentSession> {
    // Agent 无状态 — 只需 stream
    const agent = createAgentWithRegistry({
      model: options?.model,
      providerRegistry: this.providerRegistry,
    })

    // Session 泛型
    const session = this.sessionStore.createSession(options?.id)

    return new AgentSession(session, agent, {
      model: options?.model ?? this.defaultModel,
      systemPrompt: options?.systemPrompt ?? this.defaultSystemPrompt,
      tools: options?.tools ?? this.defaultTools,
    })
  }
}
```

环境变量优先级（本地模式）:

| 变量 | 说明 | 默认值 |
|---|---|---|
| `VITAMIN_HOME` | 数据根目录 | `~/.vitamin` |
| `VITAMIN_SESSION_DIR` | Session 目录覆盖 | `$VITAMIN_HOME/agent/sessions/` |
| `VITAMIN_ARCHIVE_DIR` | Archive 目录覆盖 | `$VITAMIN_HOME/agent/archives/` |
| `VITAMIN_STORAGE_TYPE` | 存储类型 | `local` |
| `VITAMIN_REMOTE_URL` | 远程 API URL | — |

---

## 实现路径

| 阶段 | 内容 | 状态 |
|---|---|---|
| **Phase 1** | 创建 `@vitamin/memory` 包，types + token-estimator + defaults + prompts | ✅ Done |
| **Phase 2** | Prune: 无 LLM 的 tool output 裁剪 + 参数截断 | ✅ Done |
| **Phase 3** | Compaction: 切点算法 + LLM 结构化摘要 + 迭代压缩 | ✅ Done |
| **Phase 4** | L3 Archive: Local / Remote / Memory 三种存储 + 归档/读取 | ✅ Done |
| **Phase 5** | L1 Persistent Memory: AGENTS.md 加载 + system prompt 注入 | ✅ Done |
| **Phase 6** | MemoryManager 统一入口: process() 一键流程 | ✅ Done |
| **Phase 7** | Memory + Session 融合: StorageConfig 统一 + AgentSession 集成 | 🔲 Next |
| **Phase 8** | `@vitamin/agent` memory.ts 迁移清理 | 🔲 Planned |
| **Phase 9** | compact_conversation 工具注册 | 🔲 Planned |
| **Phase 10** | MemoryStore 热重载 + 文件监听 | 🔲 Planned |

## 包依赖关系

```
@vitamin/memory (本包)
  ├── @vitamin/ai        — Message / AssistantMessage 类型
  ├── @vitamin/shared    — createLogger
  └── @vitamin/env       — VITAMIN_HOME 等环境变量

@vitamin/agent
  └── 可逐步迁移 memory.ts → @vitamin/memory

@vitamin/session
  └── 无直接依赖，通过 StorageConfig 保持一致

@vitamin/coding
  └── AgentSession 组合 MemoryManager + SessionManager
      └── 注入同一 StorageConfig
```

## 导出清单

| Export | 说明 |
|---|---|
| `MemoryManager`, `createMemoryManager` | 统一入口 |
| `FileSystemMemoryStore`, `InMemoryMemoryStore` | L1 存储后端 |
| `FileArchiveStorage`, `InMemoryArchiveStorage` | L3 归档后端 |
| `computeMemoryDefaults` | Model-aware 默认参数计算 |
| `estimateTokens`, `estimateContextTokens` | Token 估算工具 |
| `findCutPoint` | 切点算法 |
| `prune` | Prune 函数 |

## 类型导出

```ts
export type {
  MemoryManagerConfig,
  MemorySource,
  MemoryStore,
  ArchiveStorage,
  ArchiveEntry,
  PruneConfig,
  PruneResult,
  CompactionConfig,
  CompactionPreparation,
  CompactionResult,
  TruncateArgsConfig,
  ContextSize,
  MemoryDefaults,
}
```

## License

See [root README](../../README.md) for details.
