# @vitamin/coding

基于 vitamin 生态构建的 coding runtime。当前版本只保留 session、settings、resources 和 tools 的应用层装配，不再提供 lead session 或 orchestrator 相关依赖与公开 API。

## 当前边界

- 公开入口以 [src/index.ts](src/index.ts) 为准。
- `VitaminApp` 负责 settings、resources、tool registry、session manager 和可选 devtools 的装配。
- `AgentSession` 与 `createAgentSession()` 提供单会话运行时。
- `CodingSessionManager` 提供多会话管理、fork 与持久化适配。
- 运行模式只保留 session 级 helper：`runPrintMode`、`runJsonMode`、`runRpcMode`、`InteractiveMode`。
- 默认 builtin tools 不包含任务编排、agent delegation 或 skill loading。

## 安装

```bash
pnpm add @vitamin/coding
```

## 快速开始

### 单会话

```ts
import { createAgentSession } from '@vitamin/coding'

const session = createAgentSession({
  model: {
    id: 'github-copilot/gpt-4.1',
    provider: 'github-copilot',
    api: 'github-copilot',
    name: 'gpt-4.1',
    input: ['text'],
    output: ['text'],
    contextWindow: 128000,
    maxOutputTokens: 16384,
  },
  systemPrompt: 'You are a helpful coding assistant.',
})

await session.prompt('Explain the project structure')
session.dispose()
```

### 应用容器

```ts
import { createVitamin, runPrintMode } from '@vitamin/coding'

const vitamin = createVitamin({
  logger: {
    name: 'vitamin-app',
    level: 'info',
    destination: 'stderr',
  },
  workspaceDir: process.cwd(),
})

await vitamin.start()

const session = await vitamin.createSession()
await runPrintMode(session, 'Summarize this workspace')

await vitamin.stop()
```

## 运行时结构

```text
createVitamin(options)
  -> VitaminApp.start()
    -> settings.load()
    -> resourceManager.load()
    -> build tool registry
    -> update session defaults

session path
  -> vitamin.createSession()
  -> AgentSession.prompt()
  -> Session.buildContext()
  -> Agent.run()
  -> tool loop / persist
```

## 主要导出

### App

- `createVitamin`
- `VitaminApp`
- `VitaminAppOptions`
- `VitaminContext`

### Session

- `AgentSession`
- `createAgentSession`
- `CodingSessionManager`
- `createInMemoryCodingSessionManager`
- `createDiskCodingSessionManager`
- `createRemoteCodingSessionManager`
- `SessionManagerOptions`
- `AgentSessionOptions`
- `AgentSessionInfo`
- `AgentSessionEvent`
- `AgentSessionEventType`
- `AgentSessionSubscriber`
- `CreateAgentSessionOptions`
- `PromptOptions`

### Settings / Resources

- `Settings`
- `createSettings`
- `SettingsOptions`
- `DefaultResourceManager`
- `createResourceManager`
- `createInMemoryResourceManager`
- `ResourceManager`
- `ResourceManagerOptions`
- `LoadedResources`
- `ResourceDiagnostic`
- `PromptTemplate`

### Modes

- `InteractiveMode`
- `getLastAssistantText`
- `runJsonMode`
- `runPrintMode`
- `runRpcMode`
- `InteractiveResult`
- `JsonModeResult`
- `RpcPromptParams`
- `RpcRequest`
- `RpcResponse`

## 组件说明

### VitaminApp

`VitaminApp` 是当前推荐的多会话容器，负责：

- 加载配置与资源
- 创建 `ToolRegistry`
- 创建并管理 `CodingSessionManager`
- 暴露 `createSession()`、`getSession()`、`listSessions()`、`removeSession()`、`forkSession()`
- 在 `inspect=true` 时接入 devtools

### AgentSession

`AgentSession` 是单会话执行单元，负责把 model、tools、hooks 和 session store 串成一次完整 prompt 执行。它支持 `prompt()`、`abort()`、`compact()`、`followUp()` 和事件订阅。

### CodingSessionManager

`CodingSessionManager` 桥接 `@vitamin/session` 与 `AgentSession`。当前支持内存、磁盘和远端三种底层 session store，并统一暴露 `createSession()`、`setActive()`、`forkSession()` 和清理逻辑。

### ResourceManager

当前 `ResourceManager` 负责加载 memory 指令和 prompt 模板，不再承担 lead prompt、skill catalog 或 orchestrator 装配。

## 与 CLI 的关系

`@vitamin/cli` 现在同样走 session runtime：print、json 和 interactive 模式都会先创建 `AgentSession`，再调用本包导出的 session 级 helper。

## 进一步阅读

- 导出面：[src/index.ts](src/index.ts)
- 应用容器：[src/app/vitamin-app.ts](src/app/vitamin-app.ts)
- 会话管理：[src/session/coding-session-manager.ts](src/session/coding-session-manager.ts)

## License

See root README for details.
