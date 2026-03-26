# @vitamin/coding

基于 vitamin 生态构建的多会话 coding agent 容器。

这个包当前提供的是一个可用的应用层容器：VitaminApp。它负责管理多个 AgentSession，复用底层的 @vitamin/agent、@vitamin/session、@vitamin/hooks、@vitamin/ai 等能力。

它的设计方向参考 pi-mono 的 @mariozechner/pi-coding-agent，但当前实现还没有达到 pi-mono 的 SDK 完整度。README 只描述当前已经存在的能力；未来对齐方案放在 Roadmap 章节。

## 当前状态

- 已实现：多会话容器 VitaminApp
- 已实现：单会话协调器 AgentSession
- 已实现：单会话工厂 createAgentSession()（无需 VitaminApp）
- 已实现：统一事件订阅 subscribe()
- 已实现：基于 Hook 的消息、参数、流、工具执行拦截
- 已实现：依赖 ProviderRegistry 自动创建 Agent stream
- 已实现：可注入自定义 SessionStore
- 已实现：SettingsManager（全局 + 项目配置合并、运行时覆盖、热更新）
- 已实现：SessionManager（高层会话管理 + 持久化 + fork）
- 已实现：workspaceDir 工作目录传播（VitaminApp → SessionManager → AgentSession）
- 已实现：ResourceLoader（AGENTS.md + Skills + Prompt 模板发现与加载）
- 已实现：ExtensionManager / ExtensionAPI（扩展注册工具、Hook、Prompt）
- 已实现：运行模式工具（runPrintMode / runJsonMode / runRpcMode / InteractiveMode）
- 未实现：内置 coding tools 导出

## 安装

```bash
pnpm add @vitamin/coding
```

## Example 运行

```bash
# 完整示例（会创建会话并发起 prompt）
pnpm --filter @vitamin/coding run run:example

# 快速 smoke（只验证启动/停止链路，适合 CI 或本地快速检查）
pnpm --filter @vitamin/coding run run:example:smoke
```

## 当前导出

```ts
// 工厂
export { createVitamin, VitaminApp } from './vitamin'
export { createAgentSession } from './create-agent-session'
export { AgentSession } from './agent-session'
export { SettingsManager, createSettingsManager } from './settings-manager'
export { CodingSessionManager, createSessionManager } from './coding-session-manager'
export { DefaultResourceLoader, createResourceLoader, createInMemoryResourceLoader } from './resource-loader'
export { ExtensionManager, createExtensionManager } from './extension-api'
export { runPrintMode, runJsonMode, runRpcMode, InteractiveMode } from './run-modes'

// 类型
export type { VitaminAppOptions } from './vitamin'
export type { AgentSessionConfig } from './agent-session'
export type { SettingsManagerOptions } from './settings-manager'
export type { SessionManagerOptions } from './coding-session-manager'
export type {
  ResourceLoader, ResourceLoaderOptions, LoadedResources,
  ResourceDiagnostic, PromptTemplate,
} from './resource-loader'
export type {
  ExtensionAPI, ExtensionModule, ExtensionDescriptor,
  ExtensionActivate, LoadedExtension,
} from './extension-api'
export type {
  AgentSessionOptions,
  AgentSessionInfo,
  AgentSessionEvent,
  AgentSessionEventType,
  AgentSessionSubscriber,
  CreateAgentSessionOptions,
  PromptOptions,
} from './types'
```

三种使用方式：
- `createVitamin()` → 多会话容器，管理多个 AgentSession + 全局配置 + 会话持久化
- `createAgentSession()` → 单会话工厂，无需 VitaminApp 即可使用
- `SessionManager.inMemory()` / `.create()` → 独立的会话管理器，支持持久化和 fork

## 快速开始

### 单会话模式（createAgentSession）

```ts
import { createAgentSession } from '@vitamin/coding'

const session = createAgentSession({
  model: {
    id: 'claude-sonnet-4-20250514',
    provider: 'anthropic',
    api: 'anthropic',
    contextWindow: 200_000,
  },
  systemPrompt: 'You are a helpful coding assistant.',
})

// 统一事件订阅
const unsub = session.subscribe((event) => {
  console.log(event.type, event)
})

await session.prompt('Explain the project structure')

unsub()
session.dispose()
```

### 多会话模式（VitaminApp）

```ts
import { createVitamin } from '@vitamin/coding'

const vitamin = createVitamin({
  port: 3000,
  inspect: true,
  logger: {
    name: 'vitamin-app',
    level: 'info',
    destination: 'vitamin.log',
  },
  model: {
    id: 'claude-sonnet-4-20250514',
    provider: 'anthropic',
    api: 'anthropic',
    contextWindow: 200_000,
  },
  systemPrompt: 'You are a helpful coding assistant.',
  // Phase 2: workspaceDir + 配置 + 会话持久化
  workspaceDir: process.cwd(),
  globalConfigPath: '~/.config/vitamin/config.jsonc',
  sessionDir: '.vitamin/sessions',
  watchConfig: true,
})

await vitamin.start()

// start() 后可访问合并后的配置
console.log(vitamin.config) // VitaminConfig | null
console.log(vitamin.settings?.model) // string | undefined

// start() 后可访问加载的资源
console.log(vitamin.resourceLoader?.resources?.skills.length) // number
console.log(vitamin.resourceLoader?.resources?.agentInstructions) // AGENTS.md 注入

const session = await vitamin.createSession({ id: 'demo-session' })
console.log(session.workspaceDir) // 继承自 VitaminApp

await session.prompt('Explain the project structure')

// Fork 会话
const forked = await vitamin.forkSession('demo-session', 'demo-fork')

await vitamin.stop()
```

## 架构概览

当前结构如下：

```text
VitaminApp
  ├─ SettingsManager          ← Phase 2
  │  ├─ global config          (~/.config/vitamin/config.jsonc)
  │  ├─ project config         (${workspaceDir}/.vitamin/config.jsonc)
  │  └─ ConfigWatcher          (可选热更新)
  ├─ ResourceLoader            ← Phase 3
  │  ├─ PersistentMemory       (AGENTS.md 多源加载)
  │  ├─ loadSkills()           (Skills 发现与解析)
  │  └─ Prompt templates       (~/.vitamin/prompts/ + .vitamin/prompts/)
  ├─ ExtensionManager          ← Phase 3
  │  ├─ activate(module)       (激活扩展)
  │  └─ tools / hooks / prompts (扩展注册的资源)
  ├─ CodingSessionManager     ← Phase 2
  │  ├─ SessionManager<AgentMessage> (@vitamin/session)
  │  ├─ Map<id, AgentSession>
  │  ├─ file/memory persistence
  │  └─ fork / save / restore
  ├─ shared infrastructure
  │  ├─ logger
  │  ├─ devtools
  │  ├─ hooks
  │  └─ workspaceDir
  └─ Map<string, AgentSession>
       ├─ Agent
       ├─ Session<AgentMessage>
       ├─ model / systemPrompt / tools
       ├─ workspaceDir            ← Phase 2
       └─ thinkingLevel
```

职责分层：

- VitaminApp：应用级容器，负责会话生命周期、配置管理、资源加载和共享基础设施
- SettingsManager：运行时配置层，归并全局/项目配置，支持覆盖和热更新
- ResourceLoader：统一资源发现，协调 AGENTS.md（@vitamin/memory）、Skills（@vitamin/tools）、Prompt 模板加载
- ExtensionManager：扩展激活与资源聚合，提供 ExtensionAPI 给扩展模块
- CodingSessionManager：高层会话管理，桥接 @vitamin/session 与 AgentSession，支持持久化和 fork
- AgentSession：单会话协调器，负责 prompt 调度、上下文构建、消息持久化、Hook 集成
- @vitamin/agent：无状态 Agent 引擎，负责 work loop 与工具执行
- @vitamin/session：会话存储、分支、持久化与上下文构建
- @vitamin/config：配置加载、分层合并、Zod 校验、迁移
- @vitamin/hooks：生命周期扩展点

## VitaminApp

VitaminApp 是当前包的主入口。

### 构造参数

```ts
interface VitaminAppOptions {
  port: number
  inspect: boolean
  logger: {
    name: string
    level: 'info' | 'warn' | 'error' | 'debug' | 'trace' | 'fatal'
    destination: string
  }
  model?: Model
  tools?: AgentTool[]
  providerRegistry?: ProviderRegistry
  systemPrompt?: string
  hooks?: HookRegistry
  // Phase 2
  workspaceDir?: string                     // 工作目录（默认 process.cwd()）
  globalConfigPath?: string                 // 全局配置路径
  projectConfigPath?: string                // 项目配置路径
  configOverrides?: Partial<VitaminConfig>  // 配置覆盖
  configStore?: ConfigStore                 // 配置持久化后端
  watchConfig?: boolean                     // 热更新配置文件
  sessionDir?: string                       // 会话存储目录（启用文件持久化）
  maxSessions?: number                      // 最大并发会话数
  // Phase 3
  resourceLoader?: ResourceLoader           // 自定义资源加载器
  resourceOptions?: ResourceLoaderOptions   // 资源加载选项（默认 DefaultResourceLoader）
  extensions?: ExtensionModule[]            // 扩展模块列表（start() 时自动激活）
}
```

### 方法

```ts
class VitaminApp {
  // 属性
  readonly workspaceDir: string
  settings: SettingsManager | null           // start() 后可用
  resourceLoader: ResourceLoader | null      // start() 后可用
  extensionManager: ExtensionManager
  get config(): Readonly<VitaminConfig> | null
  get sessionManager(): CodingSessionManager

  // 会话管理
  async createSession(options?: AgentSessionOptions): Promise<AgentSession>
  getSession(id: string): AgentSession | undefined
  listSessions(): AgentSessionInfo[]
  async removeSession(id: string): Promise<boolean>
  async forkSession(sourceId: string, newId?: string): Promise<AgentSession | undefined>

  // 后台任务
  async emitBackgroundStart(taskId: string, agentName: string): Promise<void>
  async emitBackgroundEnd(taskId: string, agentName: string, success: boolean): Promise<void>

  // 生命周期
  async start(): Promise<void>
  async stop(): Promise<void>
}
```

### 说明

- start() 会创建 SettingsManager、ResourceLoader（加载 AGENTS.md + Skills + Prompts）、激活扩展，并在启用 inspect 时启动 devtools
- createSession() 委托 CodingSessionManager 创建独立的 Agent + Session 组合
- removeSession() 会销毁会话、清理持久化，并触发 session.deleted hook
- forkSession() 从已有会话分支，创建包含相同上下文的新 AgentSession
- stop() 会销毁所有会话、ResourceLoader 和 SettingsManager

## AgentSession

AgentSession 是单会话运行单元，可通过 VitaminApp.createSession() 或 createAgentSession() 获得。

### 公开能力

```ts
class AgentSession {
  readonly id: string
  readonly session: Session<AgentMessage>
  readonly workspaceDir?: string

  get status(): string

  // 统一事件订阅
  subscribe(callback: (event: AgentSessionEvent) => void): () => void

  prompt(text: string, options?: PromptOptions): Promise<void>
  steer(text: string): void
  followUp(text: string): void
  abort(): void
  compact(summary: string, compactedCount: number): Promise<void>
  dispose(): void
}
```

### PromptOptions

```ts
interface PromptOptions {
  images?: Array<{ type: 'image'; data: string; mediaType: string }>
  streamingBehavior?: 'steer' | 'followUp'
}
```

### 运行模式 API（Phase 4）

```ts
import {
  runPrintMode,
  runJsonMode,
  runRpcMode,
  InteractiveMode,
} from '@vitamin/coding'

await runPrintMode(session, 'Explain this repository')

const json = await runJsonMode(session, 'Summarize recent changes')

const rpc = await runRpcMode(session, {
  id: '1',
  method: 'prompt',
  params: { text: 'List open TODOs' },
})

const interactive = new InteractiveMode(session)
const result = await interactive.handleInput('/help')
```

### 实际工作流

prompt() 的真实执行流程：

```text
1. 检查 Agent 当前状态
2. 若正在 streaming/tool_executing，根据 streamingBehavior 进入 steer/followUp
3. 执行 hook: chat.message.before
4. 将用户消息追加到 Session
5. 调用 session.buildContext() 构建上下文
6. 执行 hook: chat.params
7. 调用 agent.run(...)
8. 在 transformContext 中执行 hook: messages.transform
9. 在工具执行前后执行 tool.execute.before / tool.execute.after
10. 将新增消息写回 Session
11. 执行 hook: chat.message.after
```

### 当前限制

- 没有 setModel()、setThinkingLevel() 等运行时切换方法
- 没有 navigateTree()、newSession() 等树导航 API（fork 已支持）
- 没有自动压缩和自动重试
- images 选项当前仅保留在类型里，prompt() 还没有实际接入图片消息构建

## SettingsManager

运行时配置管理器，封装 @vitamin/config 的分层加载、Zod 校验和文件监听。

### 创建

```ts
import { SettingsManager, createSettingsManager } from '@vitamin/coding'

// 异步工厂
const settings = await SettingsManager.create({
  cwd: '/path/to/project',
  globalConfigPath: '~/.config/vitamin/config.jsonc',
  overrides: { model: 'claude-sonnet-4-20250514' },
  watch: true, // 文件变更时自动重新加载
})

// 等价的工厂函数
const settings2 = await createSettingsManager({ cwd: process.cwd() })
```

### API

```ts
class SettingsManager {
  // 配置快照
  get config(): Readonly<VitaminConfig>
  get<K extends keyof VitaminConfig>(key: K): VitaminConfig[K]

  // 便捷属性
  get model(): string | undefined
  get compaction(): CompactionConfig | undefined
  get session(): SessionConfig | undefined

  // 运行时覆盖（累计叠加，重新加载）
  update(overrides: Partial<VitaminConfig>): Promise<VitaminConfig>

  // 变更通知
  onChange(callback: (config: VitaminConfig) => void): () => void

  dispose(): void
}
```

### 配置优先级

从低到高：默认值 → 扩展默认值 → 全局配置文件 → 项目配置文件 → 环境变量 → overrides。

VitaminApp 在 `start()` 中自动创建 SettingsManager，也可独立使用。

## SessionManager

面向 coding-agent 的高层会话管理器，桥接 @vitamin/session 的 `SessionManager<AgentMessage>` 与 `AgentSession`。

### 创建

```ts
import { SessionManager, createSessionManager } from '@vitamin/coding'

// 文件持久化模式
const mgr = SessionManager.create('.vitamin/sessions', {
  model: myModel,
  systemPrompt: 'You are a coding assistant.',
  hooks: myHooks,
  cwd: process.cwd(),
})

// 纯内存模式（测试 / 嵌入式）
const mgr2 = SessionManager.inMemory({
  model: myModel,
  hooks: myHooks,
})

// 工厂函数（自动根据 sessionDir 选择模式）
const mgr3 = createSessionManager({
  model: myModel,
  sessionDir: '.vitamin/sessions', // 有则文件模式，无则内存模式
})
```

### API

```ts
class SessionManager {
  // 会话生命周期
  async createSession(options?: AgentSessionOptions): Promise<AgentSession>
  getSession(id: string): AgentSession | undefined
  listSessions(): AgentSessionInfo[]
  async removeSession(id: string): Promise<boolean>
  async forkSession(sourceId: string, newId?: string): Promise<AgentSession | undefined>

  // 活跃会话
  setActive(id: string): AgentSession | undefined
  get active(): AgentSession | undefined

  // 持久化
  async save(id: string): Promise<void>
  async restore(id: string): Promise<AgentSession | null>
  async saveAll(): Promise<void>
  async restoreAll(): Promise<number>

  dispose(): void
}
```

VitaminApp 内部使用 CodingSessionManager 管理所有 AgentSession。也可以独立使用。

## ResourceLoader

统一资源发现与加载器，协调 AGENTS.md（@vitamin/memory）、Skills（@vitamin/tools）和 Prompt 模板。

### 创建

```ts
import {
  createResourceLoader,
  createInMemoryResourceLoader,
  DefaultResourceLoader,
} from '@vitamin/coding'

// 默认：文件系统模式
const loader = createResourceLoader({
  workspaceDir: process.cwd(),
  watch: true,
})

// 纯内存模式（测试）
const testLoader = createInMemoryResourceLoader({
  memories: new Map([['~/.vitamin/AGENTS.md', '# Instructions\nBe helpful.']]),
  skills: [mySkill],
  promptTemplates: [{ name: 'review', content: '...', filePath: '/p.md', source: 'project' }],
})
```

### API

```ts
interface ResourceLoader {
  load(): Promise<LoadedResources>
  reload(): Promise<LoadedResources>
  get resources(): LoadedResources | null
  onChange(callback: (resources: LoadedResources) => void): () => void
  dispose(): void
}

interface LoadedResources {
  agentInstructions: string           // AGENTS.md 合并注入文本
  memories: ReadonlyMap<string, string>
  skills: Skill[]                     // 已加载 Skills
  skillsPromptInjection: string       // Skills 的 system prompt 片段
  promptTemplates: PromptTemplate[]   // Prompt 模板
  diagnostics: ResourceDiagnostic[]   // 冲突/错误信息
}
```

### 资源发现路径

| 资源类型 | 用户全局 | 项目本地 |
|---------|---------|---------|
| AGENTS.md | `~/.vitamin/AGENTS.md` | `.vitamin/AGENTS.md` + `./AGENTS.md` |
| Skills | `~/.vitamin/skills/` | `.vitamin/skills/` |
| Prompts | `~/.vitamin/prompts/` | `.vitamin/prompts/` |

VitaminApp 在 `start()` 中自动创建并加载 ResourceLoader。也可独立使用。

## ExtensionManager

扩展系统入口，管理扩展模块的加载与资源注册。

### 创建

```ts
import { createExtensionManager } from '@vitamin/coding'

const mgr = createExtensionManager(hookRegistry)
```

### 编写扩展

```ts
import type { ExtensionModule, ExtensionAPI } from '@vitamin/coding'

const myExtension: ExtensionModule = {
  descriptor: { name: 'my-ext', version: '1.0.0' },
  activate: (api: ExtensionAPI) => {
    api.registerTool(myCustomTool)
    api.registerHook({
      name: 'my-ext:stream.start',
      timing: 'stream.start',
      priority: 100,
      enabled: true,
      handler: (input) => { /* ... */ },
    })
    api.registerPrompt({
      name: 'debug',
      content: '# Debug\nAnalyze the issue...',
      filePath: '/ext/prompts/debug.md',
      source: 'project',
    })
  },
}
```

### API

```ts
class ExtensionManager {
  async activate(module: ExtensionModule): Promise<LoadedExtension>
  get(name: string): LoadedExtension | undefined
  list(): LoadedExtension[]
  getAllTools(): AgentTool[]
  getAllPrompts(): PromptTemplate[]
  dispose(): void
}

interface ExtensionAPI {
  registerTool(tool: AgentTool): void
  registerTools(tools: AgentTool[]): void
  registerHook<T extends HookTiming>(registration: HookRegistration<T>): void
  registerPrompt(template: PromptTemplate): void
  readonly descriptor: ExtensionDescriptor
}
```

VitaminApp 接受 `extensions` 选项，在 `start()` 时自动激活所有扩展。

## 事件与 Hook

### 统一事件订阅（subscribe）

通过 `session.subscribe()` 可以获得统一的事件流，覆盖会话生命周期、Agent 状态、工具调用、流式传输等全部阶段：

```ts
type AgentSessionEvent =
  | { type: 'session_start'; sessionId: string }
  | { type: 'session_end'; sessionId: string }
  | { type: 'prompt_start'; sessionId: string; text: string }
  | { type: 'prompt_end'; sessionId: string }
  | { type: 'message_persisted'; sessionId: string; role: string }
  | { type: 'agent_status'; sessionId: string; from: string; to: string }
  | { type: 'streaming_start'; sessionId: string; model: string }
  | { type: 'streaming_end'; sessionId: string; model: string; stopReason: string }
  | { type: 'turn_start'; sessionId: string; turnIndex: number }
  | { type: 'turn_end'; sessionId: string; turnIndex: number }
  | { type: 'tool_call_start'; sessionId: string; toolCall: ToolCallEvent }
  | { type: 'tool_call_end'; sessionId: string; toolCall: ToolCallEvent; isError: boolean }
  | { type: 'compaction_start'; sessionId: string; messageCount: number }
  | { type: 'compaction_end'; sessionId: string; retainedCount: number }
  | { type: 'error'; sessionId: string; error: Error }
```

subscribe() 桥接了底层 Agent 的 15 种事件到统一的 AgentSessionEvent 模型。每个事件都携带 sessionId，方便在多会话场景下区分来源。

### TypedEventEmitter 事件（底层兼容）

AgentSession 继承自 TypedEventEmitter，保留原始细粒度事件：

```ts
session.on('session_start', (sessionId) => { ... })
session.on('prompt_start', (sessionId, text) => { ... })
session.on('error', (sessionId, error) => { ... })
```

推荐使用 subscribe() 代替直接 on() 监听。

### Hook 集成

当前已经接入的 Hook 时机包括：

- chat.message.before
- chat.message.after
- chat.params
- messages.transform
- tool.execute.before
- tool.execute.after
- stream.start
- stream.end
- session.created
- session.deleted
- session.error
- compaction.before
- compaction.after
- background.start
- background.end

这部分是当前实现里最接近 pi-mono 可扩展性的基础能力。

## 与 pi-mono 的关系

当前包与 pi-mono 的关系应理解为：

- 已借鉴的部分：AgentSession 协调层思路、多会话容器、steer/followUp 队列语义、Hook 化的消息/工具管线、单会话工厂、统一事件流、分层配置管理、会话持久化 + fork
- 尚未实现的部分：资源发现、扩展系统、slash commands、运行模式、JSONL 树会话管理接口

当前更准确的定位不是“pi-mono 等价替代”，而是“面向 pi-mono 风格演进的 vitamin 容器层实现”。

## Roadmap

下面是推荐的推进顺序。这里描述的是规划，不代表当前版本已经可用。

### Phase 1: SDK 入口收敛 ✅

- ✅ createAgentSession() 单会话工厂
- ✅ VitaminApp 保留为多会话容器层
- ✅ AgentSession.subscribe() 统一事件流
- ✅ AgentSessionEvent 15 种事件类型与实际发射对齐
- ✅ Agent 事件桥接（status/turn/streaming/tool_call/error）

### Phase 2: 会话与设置模型 ✅

- ✅ SessionManager 高层会话管理 API（create / get / list / remove / fork / save / restore）
- ✅ SettingsManager，支持全局配置与项目配置合并 + 运行时覆盖 + 热更新
- ✅ cwd 工作目录传播（VitaminApp → SessionManager → AgentSession）
- ✅ 会话文件持久化（通过 sessionDir 选项启用 FileSessionPersistence）
- ✅ VitaminApp 内部使用 SessionManager 替代原始 Map
- ✅ VitaminApp.start() 使用 SettingsManager 替代原始 loadConfig()
- ✅ 会话 fork 支持（forkSession）

### Phase 3: 资源与扩展 ✅

- ✅ ResourceLoader 接口 + DefaultResourceLoader（文件系统）+ InMemoryResourceLoader（测试）
- ✅ AGENTS.md 发现与加载（委托 @vitamin/memory PersistentMemory）
- ✅ Skills 发现与加载（委托 @vitamin/tools loadSkills）
- ✅ Prompt 模板发现（~/.vitamin/prompts/ + .vitamin/prompts/）
- ✅ ExtensionManager / ExtensionAPI（扩展注册工具、Hook、Prompt）
- ✅ VitaminApp 集成（start() 自动加载资源 + 激活扩展）

### Phase 4: 运行模式

- 增加 print mode
- 增加 RPC mode
- 与 @vitamin/cli 集成 interactive mode

### Phase 5: coding tools 产品化

- 对外导出稳定的内置 tools 集合
- 支持基于 cwd 的工具工厂
- 完善 tool 权限与策略控制

## 不应该假设存在的能力

以下能力在当前版本中还不存在，不应按示例调用：

- codingTools / readOnlyTools
- runPrintMode()
- runRpcMode()
- InteractiveMode
- session.setModel(...)

## License

See root README for details.
