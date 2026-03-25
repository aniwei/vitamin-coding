# @vitamin/session

会话持久化与树形分支管理
## 设计目标

| 目标 | 说明 |
|---|---|
| **Append-Only 树形存储** | 每条 entry 持有 `id` / `parentId`，形成 DAG 树。leaf 指针追踪当前活跃分支 |
| **JSONL 文件持久化** | 一行一条 JSON entry，追加写入，避免全量重写 |
| **内存模式兼容** | 同一套 SessionManager API，`persist=false` 时纯内存运行（测试/SDK） |
| **与 `@vitamin/agent` 解耦** | session 包只关心 entry 存储和树遍历，不依赖 Agent/AI 具体类型 |
| **上下文重建** | `buildSessionContext()` 沿 leaf→root 路径重建 LLM 可用消息列表，处理 compaction 边界 |
| **分支 & 导航** | 支持 branch / fork / navigateTree，允许用户在会话树中自由跳转 |

## 架构概览

```
┌─────────────────────────────────────────────────────┐
│                   @vitamin/coding                    │
│                   AgentSession                       │
│  (orchestrates Agent + SessionManager + Extensions)  │
└──────────┬──────────────────────────┬───────────────┘
           │                          │
           ▼                          ▼
┌────────────────────┐   ┌──────────────────────────────────────┐
│   @vitamin/agent   │   │         @vitamin/session              │
│   Agent / Loop     │   │  SessionManager (树遍历 / 上下文重建)  │
│   Events / State   │   │            ▼                          │
└────────────────────┘   │    SessionStorage (持久化抽象)         │
                         │      ╱              ╲                 │
                         │ LocalStorage    RemoteStorage         │
                         │ (JSONL / env)   (HTTP API)            │
                         └──────────────────────────────────────┘
```

`@vitamin/session` **不**直接耦合 `@vitamin/agent`。上层 `@vitamin/coding` 的 `AgentSession` 负责监听 Agent 事件并调用 SessionManager 的 append 方法写入 entry。

SessionManager 通过 `SessionStorage` 抽象接口访问底层存储，解耦树逻辑与 I/O 实现。内置两种实现：
- **LocalSessionStorage** — 基于 JSONL 文件，目录路径通过 `@vitamin/env` 环境变量获取
- **RemoteSessionStorage** — 基于 HTTP API，支持云端 session 同步

## 核心数据模型

### Session Header

```ts
interface SessionHeader {
  type: 'session'
  version: number          // 当前版本号（用于迁移）
  id: string               // session UUID
  timestamp: string        // ISO 8601
  cwd: string              // 工作目录
  parentSession?: string   // fork 来源路径
}
```

### Session Entry（树节点）

所有 entry 共享基础结构：

```ts
interface SessionEntryBase {
  type: string
  id: string               // 8 位 hex 短 ID
  parentId: string | null  // 父节点 ID，null = root
  timestamp: string        // ISO 8601
}
```

具体 entry 类型：

| Entry Type | 字段 | 用途 |
|---|---|---|
| `message` | `message: AgentMessage` | 用户/助手/工具结果消息 |
| `thinking_level_change` | `thinkingLevel: string` | 思维级别变更 |
| `model_change` | `provider, modelId` | 模型切换记录 |
| `compaction` | `summary, firstKeptEntryId, tokensBefore, details?` | 上下文压缩摘要 |
| `branch_summary` | `fromId, summary, details?` | 分支摘要（导航时生成） |
| `custom` | `customType, data?` | 扩展自定义数据（不参与 LLM 上下文） |
| `custom_message` | `customType, content, display, details?` | 扩展自定义消息（参与 LLM 上下文） |
| `label` | `targetId, label` | 用户书签/标签 |
| `session_info` | `name?` | 会话显示名称 |

```ts
type SessionEntry =
  | SessionMessageEntry
  | ThinkingLevelChangeEntry
  | ModelChangeEntry
  | CompactionEntry
  | BranchSummaryEntry
  | CustomEntry
  | CustomMessageEntry
  | LabelEntry
  | SessionInfoEntry
```

### Session Context（LLM 重建结果）

```ts
interface SessionContext {
  messages: AgentMessage[]  // LLM 可用消息
  thinkingLevel: string     // 当前思维级别
  model: {                  // 当前模型
    provider: string
    modelId: string
  } | null
}
```

## 持久化抽象层 (`SessionStorage`)

### 接口定义

SessionManager 不直接操作文件或网络，而是通过 `SessionStorage` 接口委托读写：

```ts
/**
 * Session 持久化抽象接口
 * SessionManager 通过此接口读写 entry，与具体存储后端解耦
 */
interface SessionStorage {
  /** 存储类型标识 */
  readonly type: 'local' | 'remote' | 'memory'

  // ── 会话生命周期 ──

  /** 创建新会话，返回 session 标识符（本地为文件路径，远程为 URL/ID） */
  create(header: SessionHeader): Promise<string>
  /** 加载已有会话的所有 entry */
  load(sessionRef: string): Promise<FileEntry[]>
  /** 检查会话是否存在 */
  exists(sessionRef: string): Promise<boolean>

  // ── Entry 读写 ──

  /** 追加单条 entry */
  append(sessionRef: string, entry: SessionEntry): Promise<void>
  /** 全量重写（迁移/分支后使用） */
  rewrite(sessionRef: string, entries: FileEntry[]): Promise<void>

  // ── 会话发现 ──

  /** 列出某工作目录下的所有会话 */
  list(cwd: string): Promise<SessionInfo[]>
  /** 列出所有工作目录的会话 */
  listAll(): Promise<SessionInfo[]>
  /** 获取最近会话标识符 */
  findMostRecent(cwd: string): Promise<string | null>
}
```

### `LocalSessionStorage` — 本地 JSONL 实现

基于文件系统的 JSONL 存储，目录路径通过 `@vitamin/env` 的环境变量获取：

```ts
import { VITAMIN_HOME } from '@vitamin/env'

class LocalSessionStorage implements SessionStorage {
  readonly type = 'local'

  constructor(options?: {
    /** 覆盖 session 根目录，默认从 env 推导 */
    sessionDir?: string
  })

  /** 默认 session 目录解析：
   * 1. 优先使用构造函数传入的 sessionDir
   * 2. 否则读取 VITAMIN_SESSION_DIR 环境变量
   * 3. 否则使用 VITAMIN_HOME/agent/sessions/<encoded-cwd>/
   *
   * VITAMIN_HOME 默认: ~/.vitamin (可通过 VITAMIN_HOME 环境变量覆盖)
   */
  getSessionDir(cwd: string): string
}
```

**环境变量**：

| 变量 | 说明 | 默认值 |
|---|---|---|
| `VITAMIN_HOME` | Vitamin 数据根目录 | `~/.vitamin` |
| `VITAMIN_SESSION_DIR` | Session 存储目录（全局覆盖） | `<VITAMIN_HOME>/agent/sessions/` |

**目录结构**：

```
$VITAMIN_HOME/
└── agent/
    └── sessions/
        ├── --home-user-project-a--/     ← encoded cwd
        │   ├── 2026-03-26T10-00-00Z_abc-123.jsonl
        │   └── 2026-03-26T11-00-00Z_def-456.jsonl
        └── --home-user-project-b--/
            └── ...
```

**延迟写入策略**：文件不会在 `create()` 时立即写入。`append()` 内部缓冲 entry，直到第一条 assistant 消息到达后才一次性 flush 到磁盘。

### `RemoteSessionStorage` — 远程 HTTP 实现

基于 HTTP API 的远程存储，支持 session 云端同步：

```ts
class RemoteSessionStorage implements SessionStorage {
  readonly type = 'remote'

  constructor(options: {
    /** API 基础 URL，e.g. "https://api.vitamin.dev/v1" */
    baseUrl: string
    /** 认证信息获取函数（按需调用，支持 token 刷新） */
    getAuth: () => Promise<{ token: string }>
    /** 请求超时 (ms)，默认 30000 */
    timeout?: number
    /** 自定义 fetch（测试注入用） */
    fetch?: typeof globalThis.fetch
  })
}
```

**REST API 契约**：

| 方法 | 路径 | 说明 |
|---|---|---|
| `POST` | `/sessions` | 创建会话，body = SessionHeader，返回 `{ id }` |
| `GET` | `/sessions/:id` | 加载所有 entry |
| `POST` | `/sessions/:id/entries` | 追加 entry |
| `PUT` | `/sessions/:id` | 全量重写 |
| `GET` | `/sessions?cwd=<cwd>` | 按工作目录列出会话 |
| `GET` | `/sessions` | 列出所有会话 |
| `GET` | `/sessions/recent?cwd=<cwd>` | 获取最近会话 |

### `MemorySessionStorage` — 内存实现

纯内存存储，无 I/O，用于测试和 SDK 场景：

```ts
class MemorySessionStorage implements SessionStorage {
  readonly type = 'memory'
}
```

### Storage 工厂

```ts
/** 根据配置创建 SessionStorage 实例 */
function createSessionStorage(options?: {
  type?: 'local' | 'remote' | 'memory'
  sessionDir?: string
  remoteUrl?: string
  getAuth?: () => Promise<{ token: string }>
}): SessionStorage

// 默认行为:
// 1. 如果指定 type，使用对应实现
// 2. 如果存在 VITAMIN_SESSION_REMOTE_URL 环境变量，使用 RemoteSessionStorage
// 3. 否则使用 LocalSessionStorage
```

## SessionManager API

SessionManager 接收 `SessionStorage` 实例，管理树结构和上下文重建：

### 生命周期

```ts
class SessionManager {
  // 工厂方法 — 均接受可选 storage 参数
  static create(cwd: string, storage?: SessionStorage): SessionManager
  static open(sessionRef: string, storage?: SessionStorage): SessionManager
  static continueRecent(cwd: string, storage?: SessionStorage): SessionManager
  static inMemory(cwd?: string): SessionManager  // 隐式使用 MemorySessionStorage

  // 底层 storage 访问
  readonly storage: SessionStorage

  // 会话管理
  newSession(options?: NewSessionOptions): Promise<string | undefined>
  getSessionId(): string
  getSessionRef(): string | undefined  // 本地为路径，远程为 ID
  getCwd(): string
  getSessionName(): string | undefined
  isPersisted(): boolean
}
```

### 追加写入

所有 append 方法创建新 entry 作为当前 leaf 的子节点，然后推进 leaf 指针：

```ts
class SessionManager {
  appendMessage(message: AgentMessage): string
  appendThinkingLevelChange(thinkingLevel: string): string
  appendModelChange(provider: string, modelId: string): string
  appendCompaction(summary: string, firstKeptEntryId: string, tokensBefore: number, details?: unknown): string
  appendCustomEntry(customType: string, data?: unknown): string
  appendCustomMessageEntry(customType: string, content: string | ContentPart[], display: boolean, details?: unknown): string
  appendSessionInfo(name: string): string
  appendLabelChange(targetId: string, label: string | undefined): string
}
```

### 树遍历

```ts
class SessionManager {
  getLeafId(): string | null
  getLeafEntry(): SessionEntry | undefined
  getEntry(id: string): SessionEntry | undefined
  getChildren(parentId: string): SessionEntry[]
  getLabel(id: string): string | undefined
  getBranch(fromId?: string): SessionEntry[]       // leaf → root 路径
  getEntries(): SessionEntry[]                      // 所有 entry（不含 header）
  getTree(): SessionTreeNode[]                      // 完整树结构
  buildSessionContext(): SessionContext              // 重建 LLM 上下文
}
```

### 分支管理

```ts
class SessionManager {
  branch(branchFromId: string): void                // 移动 leaf 到指定 entry
  resetLeaf(): void                                 // leaf 置 null（重新从头开始）
  branchWithSummary(branchFromId: string | null, summary: string, details?: unknown): string
  createBranchedSession(leafId: string): string | undefined  // 提取单条路径为新 session 文件
}
```

### 会话列表

```ts
class SessionManager {
  static list(cwd: string, storage?: SessionStorage): Promise<SessionInfo[]>
  static listAll(storage?: SessionStorage): Promise<SessionInfo[]>
}

interface SessionInfo {
  path: string
  id: string
  cwd: string
  name?: string
  parentSessionPath?: string
  created: Date
  modified: Date
  messageCount: number
  firstMessage: string
}
```

## JSONL 存储格式（LocalSessionStorage）

每个 session 文件为一个 `.jsonl` 文件，第一行为 `SessionHeader`，后续行为 `SessionEntry`：

```jsonl
{"type":"session","version":3,"id":"abc-123","timestamp":"2026-03-26T10:00:00Z","cwd":"/project"}
{"type":"message","id":"a1b2c3d4","parentId":null,"timestamp":"2026-03-26T10:00:01Z","message":{"role":"user","content":[{"type":"text","text":"Hello"}],"timestamp":1711440001000}}
{"type":"message","id":"e5f6g7h8","parentId":"a1b2c3d4","timestamp":"2026-03-26T10:00:02Z","message":{"role":"assistant","content":[{"type":"text","text":"Hi!"}],"provider":"anthropic","model":"claude-4","usage":{"input":10,"output":5},"stopReason":"end_turn"}}
{"type":"model_change","id":"i9j0k1l2","parentId":"e5f6g7h8","timestamp":"2026-03-26T10:01:00Z","provider":"openai","modelId":"gpt-5"}
```

### 文件命名

```
<sessionDir>/<ISO-timestamp>_<session-uuid>.jsonl
```

sessionDir 解析优先级:
1. 构造函数传入的 `sessionDir`
2. `VITAMIN_SESSION_DIR` 环境变量
3. `VITAMIN_HOME/agent/sessions/<encoded-cwd>/`（VITAMIN_HOME 默认 `~/.vitamin`）

## 上下文重建算法 (`buildSessionContext`)

```
1. 从 leaf 沿 parentId 回溯到 root，收集路径 path[]
2. 沿路径提取最新的 thinkingLevel 和 model
3. 找到最后一条 compaction entry（如有）
4. 构建消息列表:
   - 有 compaction: 
     a. 注入 compaction summary 作为首条消息
     b. 从 firstKeptEntryId 开始，emit 被保留的消息
     c. emit compaction 之后的所有消息
   - 无 compaction:
     按路径顺序 emit 所有 message / custom_message / branch_summary
5. 返回 { messages, thinkingLevel, model }
```

## 树形分支示例

```
         [user: Hello]          ← root (parentId=null)
              │
         [assistant: Hi!]
              │
         [user: Tell me about X]
            ╱      ╲
 [assistant: X is...]  ← branch()  [assistant: X means...]  ← 新分支
        │                                │
 [user: More?]                    [user: Go deeper]
```

- `branch("id-of-user-Tell-me")` → 将 leaf 移回该节点，后续 append 在此创建新子节点
- `getBranch()` → 返回 leaf→root 路径上的 entry 列表
- `getTree()` → 返回完整树结构（含所有分支）

## Session 版本迁移

SessionManager 内置版本迁移机制，加载旧版本文件时自动升级:

| 版本 | 变更 |
|---|---|
| v1 → v2 | 追加 `id` / `parentId` 树结构 |
| v2 → v3 | 重命名消息角色 (`hookMessage` → `custom`) |

迁移后自动 rewrite 文件。新版本号存储在 SessionHeader.version 中。

## 与上层集成

`@vitamin/coding` 的 `AgentSession` 负责整合:

```ts
// AgentSession 监听 Agent 事件，写入 SessionManager
agent.on('message_end', (event) => {
  if (event.message.role === 'user' || event.message.role === 'assistant') {
    sessionManager.appendMessage(event.message)
  }
})

// 恢复会话时，从 SessionManager 重建 Agent 状态
const context = sessionManager.buildSessionContext()
agent.replaceMessages(context.messages)
```

### AgentSession 关键职责

| 职责 | 说明 |
|---|---|
| 事件持久化 | 监听 Agent 事件，自动写入 SessionManager |
| 会话切换 | `newSession()` / `switchSession()` / `fork()` |
| 自动压缩 | 监控上下文大小，触发 compaction |
| 自动重试 | 可重试错误的指数退避 |
| 模型管理 | 切换/轮换模型，持久化到 session |
| 分支导航 | `navigateTree()` 在会话树中跳转 |
| 扩展集成 | 向扩展系统分发 session 生命周期事件 |

## 目录结构规划

```
packages/session/src/
├── index.ts                  # 公开导出
├── types.ts                  # Entry / Header / Context / SessionStorage 类型定义
├── session-manager.ts        # SessionManager 核心实现（树遍历 + 委托 storage）
├── context-builder.ts        # buildSessionContext 算法
├── migration.ts              # 版本迁移逻辑
├── storage/
│   ├── index.ts              # createSessionStorage 工厂
│   ├── local-storage.ts      # LocalSessionStorage（JSONL 文件读写）
│   ├── remote-storage.ts     # RemoteSessionStorage（HTTP API 客户端）
│   └── memory-storage.ts     # MemorySessionStorage（纯内存）
└── utils.ts                  # ID 生成、路径计算等工具函数
```

## 实现计划

### Phase 1: 核心类型与内存模式

1. 定义所有 entry 类型 (`types.ts`)
2. 实现 ID 生成、树索引构建
3. 实现 `SessionManager` 内存模式（`static inMemory()`）
4. 实现所有 append 方法 + 树遍历
5. 实现 `buildSessionContext()` 上下文重建
6. 单元测试覆盖 append / branch / context rebuild

### Phase 2: 持久化抽象层

1. 定义 `SessionStorage` 接口（`types.ts`）
2. 实现 `MemorySessionStorage`（替代原 persist=false 逻辑）
3. 实现 `LocalSessionStorage`（JSONL 读写 + 延迟写入 + env 目录解析）
4. 实现 `createSessionStorage` 工厂
5. 实现版本迁移（`migration.ts`）
6. SessionManager 重构为通过 `SessionStorage` 委托读写
7. 集成测试覆盖文件读写、迁移、断电恢复

### Phase 3: 远程存储

1. 实现 `RemoteSessionStorage`（HTTP API 客户端）
2. 定义 REST API 契约与错误处理
3. 实现认证 token 注入与刷新
4. 实现离线降级（检测 `VITAMIN_OFFLINE` 环境变量）
5. 集成测试覆盖网络错误、超时、认证失败场景

### Phase 4: 分支与导航

1. 实现 `branch()` / `resetLeaf()` / `branchWithSummary()`
2. 实现 `createBranchedSession()` 路径提取
3. 实现 `getTree()` 树结构输出
4. 实现 `label` entry 管理
5. 集成测试覆盖多分支场景

### Phase 5: 会话列表与管理

1. 实现 `static list()` / `static listAll()` 会话扫描（委托 storage.list / storage.listAll）
2. 实现 session info（名称）管理
3. 实现 `forkFrom()` 跨项目 fork
4. 性能测试覆盖大量 session 文件场景

## 安装

```bash
pnpm add @vitamin/session
```

## 基本用法

```ts
import { SessionManager, createSessionStorage } from '@vitamin/session'

// ── 本地持久化（默认，目录从 env 解析） ──
const sm = SessionManager.create('/my/project')

// 显式指定 storage
const localStorage = createSessionStorage({ type: 'local', sessionDir: '/custom/path' })
const sm2 = SessionManager.create('/my/project', localStorage)

// ── 远程持久化 ──
const remoteStorage = createSessionStorage({
  type: 'remote',
  remoteUrl: 'https://api.vitamin.dev/v1',
  getAuth: async () => ({ token: 'my-token' }),
})
const sm3 = SessionManager.create('/my/project', remoteStorage)

// ── 自动选择（env 驱动） ──
// 设置 VITAMIN_SESSION_REMOTE_URL 环境变量时自动使用 RemoteStorage
const auto = createSessionStorage() // 按 env 自动决定

// ── 追加消息 ──
sm.appendMessage({ role: 'user', content: [{ type: 'text', text: 'Hello' }], timestamp: Date.now() })
sm.appendMessage({ role: 'assistant', content: [{ type: 'text', text: 'Hi!' }], /* ... */ })

// 重建 LLM 上下文
const ctx = sm.buildSessionContext()
console.log(ctx.messages) // → [UserMessage, AssistantMessage]

// 分支
sm.branch(sm.getEntries()[0].id)
sm.appendMessage({ role: 'user', content: [{ type: 'text', text: 'Different question' }], timestamp: Date.now() })

// 纯内存模式（测试用）
const mem = SessionManager.inMemory()
```

## License

See [root README](../../README.md) for details.
