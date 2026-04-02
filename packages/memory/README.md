# @vitamin/memory

面向接入方的 memory 模块：提供持久化记忆注入、上下文裁剪/压缩、历史归档。

- 设计细节见 [DESIGN.md](./DESIGN.md)
- 本文只讲如何在业务中接入

## 安装

```bash
pnpm add @vitamin/memory
```

## 能力一览

- `PersistentMemory`：加载 `AGENTS.md` 类长期记忆并生成注入文本
- `MemoryManager`：统一编排 `prune -> compaction -> archive`
- `createArchiveStorage`：创建 `memory/file/http` 归档后端
- `createPersistenceArchiveStorage`：复用 `@vitamin/persistence` 做归档
- `estimate*`：token 估算工具函数
- `FileStateManager`：捕获工作区文件状态快照（目录树、最近修改文件）
- `OperationalLearningStore`：经验教训提取与持久化，支持按 tag/query 检索

## 快速接入（推荐）

### 1. 创建 `MemoryManager`

```ts
import { createArchiveStorage, createMemoryManager } from '@vitamin/memory'

async function summarizeWithYourModel(
  prompt: string,
  options?: { maxTokens?: number; signal?: AbortSignal },
): Promise<string> {
  // 用你自己的 LLM SDK 替换这里
  return callYourSummarizer(prompt, options)
}

export const memoryManager = createMemoryManager({
  model: {
    contextWindow: 200_000,
    maxOutput: 16_384,
  },
  summarize: summarizeWithYourModel,
  archiveStorage: createArchiveStorage({ type: 'file' }),
})
```

### 2. 启动时加载 L1 持久化记忆

```ts
await memoryManager.loadMemory()

const systemPrompt = [
  baseSystemPrompt,
  memoryManager.getMemoryPrompt(),
].filter(Boolean).join('\n\n')
```

### 3. 每轮请求前处理会话消息

```ts
import type { Message } from '@vitamin/ai'

export async function transformMessages(
  messages: Message[],
  sessionId: string,
): Promise<Message[]> {
  const result = await memoryManager.process(messages, sessionId)

  // 调用方负责把 result.messages 写回会话
  if (result.pruned || result.compacted) {
    console.info('memory optimized', {
      pruned: result.pruned,
      compacted: result.compacted,
      archivePath: result.archivePath,
    })
  }

  return result.messages
}
```

`process()` 返回值：

- `messages`: 处理后的消息（压缩时会插入 `[Conversation Summary]` 摘要消息）
- `pruned`: 是否发生 prune
- `compacted`: 是否发生 compaction
- `summary`: compaction 摘要内容
- `archivePath`: 归档路径（仅提供 `sessionId` 且归档成功时有值）

## 只接入 L1 持久化记忆（最小集成）

```ts
import {
  PersistentMemory,
  FileSystemMemoryStore,
  DEFAULT_MEMORY_SOURCES,
} from '@vitamin/memory'

const persistent = new PersistentMemory(
  new FileSystemMemoryStore(process.cwd()),
  DEFAULT_MEMORY_SOURCES,
)

await persistent.load()
const injection = persistent.getInjection()

// 注入到 system prompt
const systemPrompt = `${baseSystemPrompt}\n\n${injection}`
```

默认 sources：

1. `~/.vitamin/AGENTS.md`（可写）
2. `./.vitamin/AGENTS.md`（可写）
3. `./AGENTS.md`（只读）

## 归档后端选择

### `createArchiveStorage`（memory/file/http）

```ts
import { createArchiveStorage } from '@vitamin/memory'

const memoryArchive = createArchiveStorage({ type: 'memory' })

const fileArchive = createArchiveStorage({
  type: 'file',
  baseDir: '/tmp/vitamin-archives',
})

const httpArchive = createArchiveStorage({
  type: 'http',
  baseUrl: 'https://example.com/api',
  getAuth: async () => ({ token: 'your-token' }),
  timeoutMs: 5000,
})
```

### `createPersistenceArchiveStorage`（复用 persistence）

```ts
import { createPersistenceArchiveStorage } from '@vitamin/memory'

const archive = createPersistenceArchiveStorage({ type: 'memory' })
```

## 常用配置项

```ts
import { createMemoryManager } from '@vitamin/memory'

const memory = createMemoryManager({
  summarize: summarizeWithYourModel,
  model: { contextWindow: 200_000, maxOutput: 16_384 },
  prune: {
    trigger: ['fraction', 0.70],
    protect: ['fraction', 0.15],
    minimum: 20_000,
    protectedTools: [],
    truncateTools: ['write', 'edit', 'apply_patch', 'create_file', 'edit_notebook_file'],
    truncateMaxLength: 2_000,
  },
  compaction: {
    enabled: true,
    trigger: ['fraction', 0.85],
    keepRecent: ['fraction', 0.10],
    reserveTokens: 16_384,
    customInstructions: 'Keep architecture decisions and unresolved TODOs.',
  },
})
```

`ContextSize` 支持三种单位：

- `['tokens', n]`
- `['fraction', 0~1]`
- `['messages', n]`

生产接入建议优先使用 `tokens` 或 `fraction`。

## 读取归档

```ts
const entries = await memoryManager.listArchives(sessionId)

if (entries.length > 0) {
  const content = await memoryManager.readArchive(entries[0].path)
  console.log(content)
}
```

## 导出 API（按类别）

- 管理器：`MemoryManager`, `createMemoryManager`
- L1：`PersistentMemory`, `FileSystemMemoryStore`, `InMemoryMemoryStore`, `DEFAULT_MEMORY_SOURCES`
- L2：`prune`, `findCutPoint`, `needsCompaction`, `prepareCompaction`, `compact`
- L3：`createArchiveStorage`, `InMemoryArchiveStorage`, `LocalArchiveStorage`, `HttpArchiveStorage`, `createPersistenceArchiveStorage`, `PersistenceBackedArchiveStorage`
- 默认值与估算：`computeMemoryDefaults`, `resolveContextSize`, `estimateContextTokens`, `estimateMessagesTokens`
- Prompt 构建：`buildMemoryInjection`, `buildSummarizationPrompt`, `buildArchiveReference`
- 文件状态：`FileStateManager`
- 经验学习：`OperationalLearningStore`

## 注意事项

- `MemoryManager` 只返回处理结果，不会自动写回你的 session；调用方需自行持久化 `result.messages`。
- `archive` 失败不会阻断 compaction；请结合日志监控归档可用性。
- 默认 token 估算是近似值，若你依赖精确计费，请注入自定义 `estimateTokens`。