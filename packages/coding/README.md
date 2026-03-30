# @vitamin/coding

基于 vitamin 生态构建的应用层 coding runtime。

这个包当前的职责很明确：把 @vitamin/agent、@vitamin/ai、@vitamin/session、@vitamin/hooks、@vitamin/tools、@vitamin/orchestrator 这些底层能力装配成可运行的会话容器、lead 入口和若干运行模式辅助函数。

## 文档口径

- 本 README 只描述当前源码和 package.json 已验证的能力。
- `vitamin.lead()` 是 `@vitamin/coding` 这一层的推荐产品 / API 入口。
- 当前 CLI 的默认用户入口已经对齐到 `vitamin.lead()`；只有 `rpc` 仍保留 session 级路径。
- README 中不再把目标态能力写成已接入默认 runtime 的事实。

## 当前已验证能力

- `VitaminApp`：多会话应用容器
- `AgentSession`：单会话协调器
- `createAgentSession()`：无需 `VitaminApp` 的单会话工厂
- `CodingSessionManager`：高层会话管理、持久化和 fork
- `Settings` / `createSettings()`：配置加载、覆盖和监听
- `ResourceManager`：持久记忆注入 + prompt 模板加载
- `PromptManager`：lead / subagent system prompt 组装
- `LeadSession`：lead 运行封装与任务摘要回流
- `runLeadPrintMode` / `runLeadJsonMode` / `LeadInteractiveMode`
- `runPrintMode` / `runJsonMode` / `runRpcMode` / `InteractiveMode`
- `VitaminApp.start()` 中的 tools + orchestrator 装配
- `inspect=true` 时的 devtools 集成

## 当前未作为稳定公共 API 暴露的能力

- 稳定的子路径导出
- 默认接入的 MCP runtime 公共 API

补充说明：当前 [package.json](package.json) 只导出根入口 `.`，因此 README 不应把其他目录或概念写成已发布的稳定 API。

## 安装

```bash
pnpm add @vitamin/coding
```

## 当前运行时主链

```text
createVitamin(options)
  → VitaminApp.start()
    → settings.load()
    → resourceManager.load()
    → build initial lead system prompt
    → bootstrapToolsAndOrchestrator()
    → build final lead system prompt
    → update session defaults

常规会话路径:
  → vitamin.createSession()
  → AgentSession.prompt()
  → Session.buildContext()
  → Agent.run()
  → stream() / tool loop / persist

lead 路径:
  → vitamin.lead(userPrompt)
  → 懒创建 LeadSession
  → LeadSession.run()
  → AgentSession.prompt()
  → parseLeadResult()
```

## 推荐入口与当前 CLI 的关系

- 从 `@vitamin/coding` 这一层看，推荐的产品 / API 入口是 `vitamin.lead(userPrompt)`。
- 从当前 CLI 实现看，`print/json/interactive` 默认也已经走 `app.lead()`；只有 `rpc` 仍保留 session 级路径，doctor/config/auth 也还是占位子命令。
- `runPrintMode`、`runJsonMode`、`InteractiveMode` 仍然是本包公开导出的 session 级辅助函数，更适合 SDK 集成、链路验证和测试，不应与默认 CLI 用户入口混写。
- `orchestrator.dispatcher.dispatch()` 是内部控制面 API，适合工具回调、链路验证、后台任务和集成测试，不应与用户入口混写。

## 当前公共导出

当前公共导出以 [src/index.ts](src/index.ts) 为准。

### App

- `createVitamin`
- `VitaminApp`
- `VitaminAppOptions`

### Session

- `AgentSession`
- `AgentSessionConfig`
- `createAgentSession`
- `CodingSessionManager`
- `createSessionManager`
- `createCodingSessionManager`
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

- `LeadInteractiveMode`
- `InteractiveMode`
- `getLastAssistantText`
- `runLeadJsonMode`
- `runLeadPrintMode`
- `runJsonMode`
- `runPrintMode`
- `runRpcMode`
- `InteractiveResult`
- `JsonModeResult`
- `RpcPromptParams`
- `RpcRequest`
- `RpcResponse`

### Lead / Prompt

- `PromptManager`
- `createPromptManager`
- `LEAD_ROLE_INSTRUCTIONS`
- `SUBAGENT_ROLE_INSTRUCTIONS`
- `PromptManagerOptions`
- `PromptBuildOptions`
- `SubagentPromptOptions`
- `PromptAgentSummary`
- `PromptToolSummary`
- `LeadSession`
- `createLeadSession`
- `parseLeadResult`
- `LeadResult`
- `LeadResultStatus`
- `LeadRunOptions`
- `TaskSummary`

## 快速开始

### 单会话工厂

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

### 多会话容器

```ts
import { createVitamin, runPrintMode } from '@vitamin/coding'

const vitamin = createVitamin({
  port: 9229,
  inspect: false,
  logger: {
    name: 'vitamin-app',
    level: 'info',
    destination: 'stderr',
  },
  workspaceDir: process.cwd(),
})

await vitamin.start()

console.log(vitamin.config)
console.log(vitamin.resources?.promptTemplates.length)
console.log(vitamin.getLeadSystemPrompt())

const session = await vitamin.createSession()
await runPrintMode(session, 'Summarize this workspace')

const lead = await vitamin.lead('Plan a refactor for the session layer')
console.log(lead.status)
console.log(lead.tasks)

await vitamin.stop()
```

## 关键组件

### VitaminApp

当前主入口，负责：

- 创建并持有 `SettingsManager`
- 创建并持有 `ResourceManager`
- 创建并持有 `PromptManager`
- 创建 `ToolRegistry` 并注册内置工具 / 用户注入工具
- 装配 `Orchestrator`
- 管理多个 `AgentSession`
- 提供 `lead()`、`createSession()`、`forkSession()` 等高层入口

### AgentSession

单会话执行单元。`prompt()` 的主顺序是：

1. `chat.message.before`
2. `session.append(userMessage)`
3. `session.buildContext()`
4. `chat.params`
5. `system-prompt.transform`
6. `agent.run()`
7. `messages.transform`
8. `tool.execute.before` / `tool.execute.after`
9. 持久化新增消息
10. `chat.message.after`

它支持 `steer()`、`followUp()`、`abort()`、`compact()`，并对外暴露统一事件流。

### CodingSessionManager

负责：

- `createSession()`
- `getSession()`
- `listSessions()`
- `removeSession()`
- `forkSession()`
- `setActive()` / `active`

它桥接了 `@vitamin/session` 的底层会话管理与 `AgentSession` 的运行时装配。

### Settings / createSettings

封装 `@vitamin/config`：

- 支持全局配置路径
- 支持项目配置路径
- 支持运行时 overrides
- 支持 watcher 热更新
- 默认项目路径是 `${workspaceDir}/.vitamin/config.jsonc`

### ResourceManager

当前 `ResourceManager` 只做两类事情：

- 通过 `@vitamin/memory` 加载 persistent memory，并生成 `agentInstructions`
- 从 `~/.vitamin/prompts` 与 `${workspaceDir}/.vitamin/prompts` 发现 `.md` prompt 模板

它当前不会像旧版 README 所说那样统一加载 skills 或扩展资源。

`LoadedResources` 当前结构是：

- `agentInstructions`
- `memories`
- `promptTemplates`
- `diagnostics`

### PromptManager

负责把以下信息拼成 lead / subagent system prompt：

- 用户自定义 system prompt
- `agentInstructions`
- lead 或 subagent 角色说明
- agent catalog
- tool catalog

当前已验证的 runtime catalog 是：

- agent catalog
- tool catalog

当前不应把 MCP catalog 写成默认已接入事实。

### LeadSession

`LeadSession` 是 `AgentSession` 的轻量包装，增加了：

- 订阅 orchestrator 的 `task.created` / `task.completed` / `task.failed`
- 聚合 `TaskSummary[]`
- 将首行状态解析为 `done` / `done_with_concerns` / `needs_context` / `blocked`

## 运行模式

当前包已经导出：

- `runLeadPrintMode(app, prompt)`
- `runLeadJsonMode(app, prompt)`
- `LeadInteractiveMode`
- `runPrintMode(session, prompt)`
- `runJsonMode(session, prompt)`
- `runRpcMode(session, request)`
- `InteractiveMode`

注意区分两层：

- `@vitamin/coding` 现在同时提供 lead 级和 session 级两组模式 helper
- `@vitamin/cli` 当前对 `rpc` 子命令的完整 stdin/stdout JSON-RPC 壳仍是 TODO

## 当前边界

- 当前公共包导出只有根入口，没有稳定子路径导出
- 当前 README 不再把未接入根导出的能力写成已发布公共 API
- 当前 CLI 默认用户入口已经统一到 `vitamin.lead()`，但 `rpc` 与其他子命令仍不是完整产品壳
- 当前 `ResourceManager` 不负责 skills 加载
- 当前文档中的“默认用户入口”与“内部 session 级路径”仍需要严格区分

## 进一步阅读

- lead 装配链：[docs/lead-flow.md](docs/lead-flow.md)
- 当前导出面：[src/index.ts](src/index.ts)
- 应用容器：[src/app/vitamin-app.ts](src/app/vitamin-app.ts)

## License

See root README for details.
