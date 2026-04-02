# @vitamin/coding

基于 vitamin 生态构建的 coding runtime。当前版本以 `VitaminApp` 和 `AgentSession` 为核心，内部接入 `PromptManager`、`Orchestrator`、`ToolRegistry`、`CodingSessionManager` 和运行学习 Hook。

## 当前边界

- 公开入口以 [src/index.ts](src/index.ts) 为准。
- `VitaminApp` 负责装配 settings、provider registry、hook registry、prompt manager、internal orchestrator、tool registry、session manager 和可选 devtools。
- `AgentSession` 与 `createAgentSession()` 提供单会话运行时。
- `CodingSessionManager` 提供多会话管理、fork 与持久化适配。
- 默认 tool surface 包含任务编排与方法论工具，如 `task_delegate`、`agent_task`、`review_call`、`write_todos`、`capture_file_state`、`learn`。
- skill 工具会先注册再被 coding runtime 主动移除，因此不属于当前默认能力面。
- `ResourceManager` 仍是容器成员，但当前不在主动 session 执行主链上。
- lead guidance prompt 通过 `promptRefresh` 在 `AgentSession.prompt()` 前懒组装，而不是在 `start()` 中预构建。

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
    id: 'claude-sonnet-4-20250514',
    name: 'Claude Sonnet 4',
    provider: 'anthropic',
    api: 'anthropic-messages',
    baseUrl: 'https://api.anthropic.com',
    reasoning: true,
    input: ['text'],
    cost: {
      input: 3,
      output: 15,
      cacheRead: 0.3,
      cacheWrite: 3.75,
    },
    contextWindow: 200_000,
    maxOutputTokens: 8_192,
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
  port: 0,
  inspect: false,
  logger: {
    name: 'vitamin-app',
    level: 'info',
    destination: 'stderr',
  },
  model: {
    id: 'claude-sonnet-4-20250514',
    name: 'Claude Sonnet 4',
    provider: 'anthropic',
    api: 'anthropic-messages',
    baseUrl: 'https://api.anthropic.com',
    reasoning: true,
    input: ['text'],
    cost: {
      input: 3,
      output: 15,
      cacheRead: 0.3,
      cacheWrite: 3.75,
    },
    contextWindow: 200_000,
    maxOutputTokens: 8_192,
  },
  workspaceDir: process.cwd(),
})

await vitamin.start()

const session = await vitamin.createSession()
await runPrintMode(session, 'Summarize this workspace')

await vitamin.stop()
```

### Example 脚本

仓库内置了两个和本文示例对应的可执行脚本：

- `pnpm run:example:simple`：简单任务示例，默认模型是 `github-copilot/gpt-4o`
- `pnpm run:example:complex`：复杂任务示例，默认模型是 `github-copilot/gemini-2.5-pro`
- `pnpm run:example:compare`：批量比较不同模型在复杂任务示例中的行为差异

这几个脚本都支持通过环境变量覆写模型：

```bash
CODING_EXAMPLE_MODEL_ID=github-copilot/gpt-4.1 pnpm run:example:complex
```

复杂任务示例还支持覆写 prompt 和工具回合上限：

```bash
CODING_EXAMPLE_MODEL_ID=github-copilot/gemini-2.5-pro \
CODING_EXAMPLE_MAX_TOOL_TURNS=20 \
CODING_EXAMPLE_PROMPT='重构 session 模块：拆分 agent-session.ts 为独立的 prompt-handler 和 lifecycle-manager' \
pnpm run:example:complex
```

默认情况下，`run:example:complex` 会先创建一个临时沙箱工作区，再在该副本上执行复杂任务，避免直接修改当前工作目录。它会优先从 git `HEAD` 导出 `packages/coding` 快照；如果当前目录不在 git 仓库中，则回退为复制当前目录。只有在显式设置 `CODING_EXAMPLE_WORKSPACE_DIR` 时，才会改为对指定目录直接执行。

当前这套 prompt 与 Copilot provider 的实测结论：

- `github-copilot/gpt-4o`：能稳定完成简单任务，但复杂任务通常只给出建议，不进入工具循环
- `github-copilot/gpt-4.1`：比 `gpt-4o` 更容易输出 phase 标记，但复杂任务仍经常不调用工具
- `github-copilot/o4-mini`：当前订阅下返回 `model_not_supported`
- `github-copilot/gemini-2.5-pro`：复杂任务最容易实际调用 `bash`、`read`、`edit` 等工具，因此被设为复杂示例默认模型

## 运行时结构

```text
createVitamin(options)
  -> new VitaminApp(...)
    -> create settings / providers / hooks / prompt / orchestrator / tools / sessions
    -> register runtime hooks

vitamin.start()
  -> settings.load()
  -> optional devtools.start()

session path
  -> vitamin.createSession()
  -> resolve model / agent config / tools
  -> AgentSession.prompt()
  -> promptRefresh()
  -> system-prompt.transform
  -> Agent.run()
  -> tool loop / persist / idle hooks
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

### Prompt

- `PromptCache`
- `PromptManager`
- `LocalPromptProvider`
- `RemotePromptProvider`
- `createPromptProvider`
- `BUILTIN_PROMPTS_DIR`
- `injectPhaseContext`
- `extractPhaseFromMessage`
- `buildLessonInjection`
- `SESSION_END_LEARNING_PROMPT`
- `PromptEntry`
- `PromptProvider`
- `PromptProviderOptions`
- `AssembleOptions`
- `PhaseAnnotation`
- `Lesson`

## 组件说明

### VitaminApp

`VitaminApp` 是当前推荐的多会话容器，负责：

- 加载配置
- 创建并连接 `PromptManager`、`Orchestrator`、`ToolRegistry`、`CodingSessionManager`
- 通过 `createSession()` 统一解析 model、slot、agent 级配置和工具白名单
- 注册 phase / lesson / idle learning Hook
- 在 `inspect=true` 时接入 devtools

### AgentSession

`AgentSession` 是单会话执行单元，负责把 model、tools、hooks 和 session store 串成一次完整 prompt 执行。它支持 `prompt()`、`abort()`、`compact()`、`followUp()` 和事件订阅。

### CodingSessionManager

`CodingSessionManager` 桥接 `@vitamin/session` 与 `AgentSession`。当前支持内存、磁盘和远端三种底层 session store，并统一暴露创建、切换、fork、恢复和清理逻辑。

### PromptManager

`PromptManager` 负责从 prompt provider 加载 `lead-guidance` sections，做 section 级缓存，并在每次 prompt 前组装最终 system prompt。

### ResourceManager

当前 `ResourceManager` 仍然保留在容器中，但不在默认执行主链上。它更像一个保留的资源边界，而不是当前 session runtime 的关键路径。

## 完整任务流程详解

本节通过两个具体例子（简单任务 / 复杂任务），说明 vitamin/coding 从用户输入到最终输出的完整流程，涵盖 prompt 拼接、agent 创建、任务派发、工具执行等各环节，并标注每一步涉及的具体模块。

### 架构总览

```
用户输入
  │
  ▼
VitaminApp                              ← packages/coding/src/app/vitamin-app.ts
  ├─ SettingsManager                    ← @vitamin/resources
  ├─ ProviderRegistry + ModelRegistry   ← @vitamin/ai
  ├─ HookRegistry (31+ 拦截点)          ← @vitamin/hooks
  ├─ ToolRegistry (minimal/standard/full 分层) ← @vitamin/tools
  ├─ PromptManager (lead-guidance 组装)  ← @vitamin/prompt
  ├─ Orchestrator (任务编排/重试/熔断)    ← @vitamin/orchestrator
  └─ CodingSessionManager               ← packages/coding/src/session/
       │
       ▼
  AgentSession                          ← packages/coding/src/session/agent-session.ts
       │
       ▼
  Agent + WorkLoop                      ← @vitamin/agent (agent.ts + work-loop.ts)
       ├─ Stream (LLM 流式调用)          ← @vitamin/ai
       ├─ ToolExecutor (工具执行)         ← @vitamin/agent/tool-executor.ts
       └─ ToolHookExecutor (Hook 链)     ← packages/coding/src/session/hooks.ts
```

### 工具分层（ToolRegistry 预设）

| 预设 | 工具 | 注册位置 |
|------|------|----------|
| **minimal** | `read`, `write`, `edit`, `bash` | `@vitamin/tools` register-builtin.ts |
| **standard** | + `ls`, `find`, `grep`, `task_delegate`, `write_todos` | 同上 |
| **full** | + `review_call`, `agent_call`, `agent_task`, `task_create`, `task_get`, `task_list`, `task_update`, `background_output`, `background_cancel`, `clarify_request`, `capture_file_state`, `learn`, `session_manager`, `skill_load`, `skill_execute` | 同上 |

### Lead Agent 系统提示词组装

系统提示词由 `PromptManager`（`@vitamin/prompt`）从 `prompts/lead-guidance/` 目录加载并按序拼接：

```
workflow-overview.md        ← 简单/中等/复杂任务的工作流引导
phase-discipline.md         ← Clarify → Plan → Execute → Verify → Conclude 阶段模型
complexity-routing.md       ← Direct / Lightweight / Full Pipeline 复杂度路由
review-guidance.md          ← 何时发起 review、review 循环
model-slot-guidance.md      ← normal / thinking / compact / critique / vision 槽位说明
file-state-guidance.md      ← 何时刷新文件状态
```

拼接时机：每次 `AgentSession.prompt()` 执行前，通过 `promptRefresh` 回调调用 `PromptManager.assemble()` 重新组装。组装后再经过两轮 Hook 增强：

1. **lesson-injection Hook**（优先级 40）：从 `OperationalLearningStore` 加载历史经验，注入到 system prompt 尾部
2. **phase-injection Hook**（优先级 30）：注入当前会话的阶段上下文（如 `[Phase: Execute]`）

这两个 Hook 都挂在 `system-prompt.transform` 时机，在 `VitaminApp.registerHooks()` 中注册。

---

### 例 1：简单任务 —— "读取 package.json 并告诉我版本号"

#### 复杂度路由判定

Lead Agent 根据系统提示词中的 **Complexity Routing** 指引，判定为 **Direct**（单文件、无歧义），直接使用本地工具完成，不需要 plan 或 delegate。

#### 完整执行流程

```
步骤 1: 用户调用入口
━━━━━━━━━━━━━━━━━━
模块: packages/coding/src/app/vitamin-app.ts — VitaminApp
```
```ts
const session = await vitamin.createSession()
await session.prompt('读取 package.json 并告诉我版本号')
```

`VitaminApp.createSession()` 内部：
- 调用 `resolveSessionModel()` 解析模型（从 options → settings → model_slots → default 优先级链）
- 读取 per-agent 配置（`settings.get('agents')?.[agentName]`），获取 `system_prompt` / `tools` 白名单 / `max_tool_turns`
- 调用 `CodingSessionManager.createSession()` → 创建底层 `Session<AgentMessage>`（`@vitamin/session`）
- 调用 `createAgentWithRegistry()` → 创建 `Agent` 实例（`@vitamin/agent`）并绑定 stream 函数
- 包装为 `AgentSession` 返回

```
步骤 2: AgentSession.prompt() — 消息预处理
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
模块: packages/coding/src/session/agent-session.ts — AgentSession
```

2a. **promptRefresh**：调用 `PromptManager.assemble()`（`@vitamin/prompt`），从 `prompts/lead-guidance/` 加载 6 个 section，按序拼接为完整系统提示词

2b. **chat.message.before Hook**（`@vitamin/hooks`）：允许外部修改或取消消息

2c. **追加到 Session**：`session.append(userMessage)` → 持久化到 `SessionStore`（`@vitamin/session`）

2d. **构建上下文**：`session.buildContext()` → 返回 `{ messages: [...], summary?: "..." }`

2e. **chat.params Hook**：允许修改 `temperature` / `maxTokens` / `thinkingLevel`

2f. **system-prompt.transform Hook**（`@vitamin/hooks`）：
- lesson-injection：注入历史经验到提示词
- phase-injection：注入当前阶段上下文

```
步骤 3: Agent.run() → workLoop() — 核心工作循环
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
模块: @vitamin/agent — agent.ts + work-loop.ts
```

3a. 创建 `ToolExecutor`（`@vitamin/agent/tool-executor.ts`），包装所有 `AgentTool`

3b. 创建 `ToolHookExecutor`（`packages/coding/src/session/hooks.ts`），桥接 `tool.execute.before` / `tool.execute.after` Hook

3c. 进入 **WorkLoop Turn 1**：

```
  ┌─ messages.transform Hook (消息压缩/变换)
  │
  ├─ convertToLLM(messages) → 转换为 LLM 消息格式
  │
  ├─ 构建 StreamContext:
  │    systemPrompt: "### 工作流程引导\n你是 lead agent...\n### Phase Discipline..."
  │    messages: [{ role: "user", content: "读取 package.json 并告诉我版本号" }]
  │    tools: [read, write, edit, bash, ls, find, grep, task_delegate, review_call, agent_task, ...]
  │
  ├─ stream(context, signal) → LLM 流式调用 (@vitamin/ai)
  │    └─ provider.converse() → 请求 Anthropic/OpenAI API
  │
  └─ LLM 响应:
       role: "assistant"
       content: "我来读取 package.json..."
       toolCalls: [{ id: "call_1", name: "read", arguments: { path: "package.json" } }]
       stopReason: "tool_use"
```

3d. 进入 **工具执行阶段**：

```
  ┌─ 区分只读/修改工具: read 是只读工具 → 并行执行
  │
  ├─ ToolExecutor.execute(toolCall):
  │    ├─ tool.execute.before Hook → 允许修改参数或取消
  │    ├─ Zod schema 参数验证
  │    ├─ read.execute({ path: "package.json" }) → 读取文件内容
  │    └─ tool.execute.after Hook → 允许修改结果
  │
  └─ 追加 tool_result 到 messages: { role: "tool_result", content: "{ \"name\": \"...\", \"version\": \"1.0.0\" }" }
```

3e. **WorkLoop Turn 2**（继续内层循环）：

```
  ┌─ stream(context, signal) → 带有工具结果的第二次 LLM 调用
  │    messages: [user, assistant(tool_use), tool_result]
  │
  └─ LLM 响应:
       role: "assistant"
       content: "package.json 的版本号是 1.0.0"
       stopReason: "end_turn"  ← 无工具调用，结束循环
```

3f. 退出内层循环 → 检查 followUp 队列 → 空 → 退出外层循环 → 返回 `AssistantMessage`

```
步骤 4: 收尾
━━━━━━━━━━━
模块: packages/coding/src/session/agent-session.ts
```

4a. `persistNewMessages()`：将 workLoop 中新增的消息（assistant + tool_result + assistant）持久化回 `Session`

4b. **chat.message.after Hook**

4c. **session.idle Hook** → 触发 session-end-learning（仅首次）：从 LLM 提取可复用经验

#### 执行时序图

```
VitaminApp          AgentSession          Agent/WorkLoop        ToolExecutor        LLM (Stream)
    │                    │                      │                    │                    │
    │─createSession()──→│                      │                    │                    │
    │←─AgentSession─────│                      │                    │                    │
    │                    │                      │                    │                    │
    │─prompt("读取...")─→│                      │                    │                    │
    │                    │─promptRefresh()──→PromptManager.assemble()                    │
    │                    │←─systemPrompt────────│                    │                    │
    │                    │                      │                    │                    │
    │                    │─[Hook] chat.message.before               │                    │
    │                    │─[Hook] system-prompt.transform            │                    │
    │                    │                      │                    │                    │
    │                    │──agent.run()────────→│                    │                    │
    │                    │                      │──stream()─────────────────────────────→│
    │                    │                      │←─assistant(tool_use: read)────────────│
    │                    │                      │                    │                    │
    │                    │                      │─execute("read")──→│                    │
    │                    │                      │←─tool_result──────│                    │
    │                    │                      │                    │                    │
    │                    │                      │──stream()─────────────────────────────→│
    │                    │                      │←─assistant("版本号是 1.0.0")──────────│
    │                    │                      │                    │                    │
    │                    │←─AssistantMessage─────│                    │                    │
    │                    │─persistNewMessages()  │                    │                    │
    │                    │─[Hook] session.idle   │                    │                    │
    │←─void─────────────│                      │                    │                    │
```

---

### 例 2：复杂任务 —— "重构 session 模块：拆分 agent-session.ts 为独立的 prompt-handler 和 lifecycle-manager"

#### 复杂度路由判定

Lead Agent 根据 **Complexity Routing** 指引，判定为 **Full Pipeline**（跨模块、需设计决策），进入完整的 Clarify → Plan → Execute → Verify → Conclude 流程。

#### 完整执行流程

```
步骤 1: 用户调用入口 (同简单任务)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
模块: packages/coding/src/app/vitamin-app.ts — VitaminApp
```

`VitaminApp.createSession()` 解析 model 和工具列表（默认 `full` preset，包含 `task_delegate`、`review_call`、`agent_task` 等编排工具）。

```
步骤 2: AgentSession.prompt() 与提示词组装 (同简单任务)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

关键区别：系统提示词中的 **Workflow Overview** section 指引 Lead Agent 对复杂任务执行：

```
#### 复杂任务（多文件、需要设计决策）
1. 先用 clarify_request 确认需求
2. 创建 plan（写入文件或记录在回复中）
3. 用 task_delegate(planId, taskId) 按计划逐步执行
4. 关键步骤完成后用 review_call 请 reviewer agent review
5. 确认所有任务完成后总结
```

```
步骤 3: Agent WorkLoop — Lead Agent 的多轮编排
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
模块: @vitamin/agent — work-loop.ts
```

**Turn 1: [Phase: Clarify] — 理解与探索**

Lead Agent 调用 `read` 工具阅读相关源文件：

```
LLM 输出:
  content: "[Phase: Clarify] 我先阅读当前的 agent-session.ts 了解结构..."
  toolCalls: [
    { name: "read", arguments: { path: "packages/coding/src/session/agent-session.ts" } },
    { name: "read", arguments: { path: "packages/coding/src/session/types.ts" } },
  ]
```

WorkLoop 执行这两个只读工具（**并行执行**，因为都标记为 `readonly`）。`phase-extraction` Hook 从回复中提取 `[Phase: Clarify]` 并记录到 `phaseTracker`。

**Turn 2: [Phase: Plan] — 制定重构计划**

```
LLM 输出:
  content: "[Phase: Plan] 基于分析，我制定如下重构计划：
    1. 创建 prompt-handler.ts — 提取 prompt 相关逻辑
    2. 创建 lifecycle-manager.ts — 提取生命周期管理
    3. 修改 agent-session.ts — 委托到新模块
    4. 更新 index.ts 导出
    5. 运行测试验证"
  toolCalls: [
    { name: "write_todos", arguments: { items: [...] } }
  ]
```

**Turn 3-5: [Phase: Execute] — 通过 task_delegate 派发子任务**

Lead Agent 使用 `task_delegate` 工具将具体实现任务派发给 sub-agent：

```
LLM 输出:
  content: "[Phase: Execute] 开始执行第一步..."
  toolCalls: [{
    name: "task_delegate",
    arguments: {
      prompt: "在 packages/coding/src/session/ 下创建 prompt-handler.ts，
               从 agent-session.ts 中提取 promptRefresh、system-prompt.transform
               和 chat.message.before 相关的逻辑到该文件...",
      subagent: "coder",
      mode: "sync",
      sessionMode: "ephemeral",
      slot: "normal"
    }
  }]
```

此时 WorkLoop 的工具执行触发以下 **子任务流**：

```
步骤 3a: task_delegate 工具执行
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
模块: @vitamin/tools — orchestration/task-delegate.ts
```

`task_delegate.execute()` 调用注入的 `dispatch` 回调 → 触发 `Orchestrator.dispatchTask()`

```
步骤 3b: Orchestrator 编排
━━━━━━━━━━━━━━━━━━━━━━━━━
模块: @vitamin/orchestrator — orchestrator.ts → executor.ts
```

`TaskExecutor.dispatch()` 内部：
- 并发度检查（`running.length < maxActiveTasks`）
- 熔断器检查（`circuitBreaker.isOpen()`）
- `TaskStore.create()` 创建任务记录（`@vitamin/orchestrator/task-store.ts`）
- 触发 `task.created` Hook
- sync 模式 → 调用 `executeTask(taskId)`

`TaskExecutor.executeTask()` 内部：
- 更新任务状态为 `running`
- 触发 `task.started` Hook
- 调用 `runSession()` 回调 — 这是在 VitaminApp 构造函数中注入的闭包

```
步骤 3c: runSession 回调 — 创建子 Agent 会话
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
模块: packages/coding/src/app/vitamin-app.ts — run 闭包
```

```ts
const run = async (options) => {
  // sessionMode === 'ephemeral' → 创建全新 session
  const session = await this.createSession({
    agentName: options.agentName,   // "coder"
    slot: options.slot,             // "normal"
  })
  await session.prompt(options.prompt)
  const text = getLastAssistantText(session.session.messages())
  // ephemeral → 执行后删除 session
  await this.removeSession(session.id)
  return { text, sessionId: session.id, durationMs }
}
```

`this.createSession({ agentName: "coder" })` 内部：
- `resolveSessionModel()` → 根据 `settings.agents.coder.default_workflow_slot` 或 `slot: "normal"` 解析模型
- `createModelSlot()` → 通过 `ModelRegistry`（`@vitamin/ai`）查找 normal 槽位对应的模型
- 读取 `settings.agents.coder.system_prompt` → 子 Agent 专属系统提示词
- 读取 `settings.agents.coder.tools` → 工具白名单过滤
- `CodingSessionManager.createSession()` → 创建新 Session + Agent 实例

```
步骤 3d: 子 Agent 的系统提示词
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

子 Agent 的 systemPrompt 组装：
- **基础**：`agentConfig.system_prompt`（从 settings 读取的 per-agent prompt）
- **promptRefresh 刷新**：每次 prompt 前调用 `PromptManager.assemble()` 重新拼接
- **Hook 增强**：同样经过 `system-prompt.transform` Hook 链（lesson-injection + phase-injection）

与 Lead Agent 的关键区别：
- Lead Agent 的提示词包含完整的 **workflow-overview**（任务编排指引），拥有 `task_delegate` / `review_call` / `agent_task` 等编排工具
- Sub-agent（如 "coder"）的提示词通常只包含代码实现指引，工具列表被白名单过滤为 `read` / `write` / `edit` / `bash` / `grep` 等执行工具

```
步骤 3e: 子 Agent 的 WorkLoop 执行
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
模块: @vitamin/agent — work-loop.ts (递归的独立循环)
```

子 Agent 进入自己的 WorkLoop，使用 `read` / `write` / `edit` 工具完成文件创建。流程与简单任务相同（stream → tool_use → tool_result → stream → end_turn），但没有编排工具。

子 Agent 完成后返回文本结果 → `TaskExecutor` 更新任务状态为 `completed` → 触发 `task.completed` Hook → 熔断器 `circuitBreaker.success()`

```
步骤 3f: 返回到 Lead Agent 的 WorkLoop
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

`task_delegate` 工具返回结果：
```
tool_result: "Task delegated successfully: prompt-handler.ts 已创建，包含 promptRefresh 和 message before hook 逻辑..."
```

Lead Agent 继续下一轮 WorkLoop，dispatch 下一个子任务...

**Turn 6: [Phase: Execute] — 通过 review_call 请求 Review**

```
LLM 输出:
  content: "[Phase: Verify] 所有文件已修改，请 reviewer 检查..."
  toolCalls: [{
    name: "review_call",
    arguments: {
      agent: "reviewer",
      prompt: "请检查 packages/coding/src/session/ 下的重构变更：
               新增 prompt-handler.ts、lifecycle-manager.ts，
               修改了 agent-session.ts，确认接口一致性和测试覆盖...",
      slot: "critique"
    }
  }]
```

```
步骤 4: review_call 工具执行
━━━━━━━━━━━━━━━━━━━━━━━━━
模块: @vitamin/tools — orchestration/agent-call.ts
```

`review_call.execute()` 调用注入的 `call` 回调 → `Orchestrator.callAgent()` → `TaskExecutor.callAgent()`

与 `task_delegate` 的区别：`callAgent` 不创建 TaskStore 记录，直接调用 `runSession()`，是轻量级的同步隔离调用。

```ts
// TaskExecutor.callAgent()
const result = await this.runSession({
  prompt,
  sessionMode: 'ephemeral',
  agentName: 'reviewer',
  slot: 'critique',          // 使用 critique 模型槽位 → 可能映射到不同模型
})
return { success: true, output: result.text }
```

Reviewer Agent 的 session 创建流程：
- `resolveModelFromSlot('critique')` → `createModelSlot()` → 解析 critique 槽位对应的模型（如 `gpt-4-turbo`）
- 读取 `settings.agents.reviewer.system_prompt` → reviewer 专属的代码审查指引
- 工具白名单通常只包含 `read` / `grep` / `find`（只读工具）

Reviewer Agent 执行后返回审查结果，Lead Agent 收到 review 反馈。

**Turn 7: [Phase: Verify] — 运行测试**

```
LLM 输出:
  content: "[Phase: Verify] Review 通过，运行测试确认..."
  toolCalls: [{ name: "bash", arguments: { command: "pnpm test -- packages/coding" } }]
```

**Turn 8: [Phase: Conclude] — 总结**

```
LLM 输出:
  content: "[Phase: Conclude] 重构完成。变更摘要：
    - 新增 prompt-handler.ts (120 行)
    - 新增 lifecycle-manager.ts (85 行)
    - 修改 agent-session.ts (从 400 行降至 180 行)
    - 所有测试通过"
  stopReason: "end_turn"  ← 结束
```

**Turn 9: session.idle Hook — 经验提取**

workLoop 结束后，`session.idle` Hook 触发 session-end-learning：Lead Agent 被要求提取本次重构中可复用的经验 → 存入 `OperationalLearningStore` → 下次会话的 `lesson-injection` Hook 会自动注入。

#### 完整时序图

```
用户        VitaminApp       Lead AgentSession     Lead WorkLoop       Orchestrator       Sub-Agent Session    Sub-Agent WorkLoop
 │               │                  │                    │                   │                     │                    │
 │─prompt()────→│                  │                    │                   │                     │                    │
 │               │─createSession()─→│                    │                   │                     │                    │
 │               │                  │─PromptManager.assemble()              │                     │                    │
 │               │                  │  (拼接 6 个 lead-guidance section)     │                     │                    │
 │               │                  │─[Hook] system-prompt.transform        │                     │                    │
 │               │                  │  (+ lesson-injection, phase-injection) │                     │                    │
 │               │                  │                    │                   │                     │                    │
 │               │                  │──agent.run()──────→│                   │                     │                    │
 │               │                  │                    │                   │                     │                    │
 │               │                  │              Turn 1: [Clarify]         │                     │                    │
 │               │                  │                    │─stream()→LLM      │                     │                    │
 │               │                  │                    │←─read(agent-session.ts)                 │                    │
 │               │                  │                    │─execute(read)      │                     │                    │
 │               │                  │                    │                   │                     │                    │
 │               │                  │              Turn 2: [Plan]            │                     │                    │
 │               │                  │                    │─stream()→LLM      │                     │                    │
 │               │                  │                    │←─write_todos()     │                     │                    │
 │               │                  │                    │                   │                     │                    │
 │               │                  │              Turn 3: [Execute]         │                     │                    │
 │               │                  │                    │─stream()→LLM      │                     │                    │
 │               │                  │                    │←─task_delegate()   │                     │                    │
 │               │                  │                    │                   │                     │                    │
 │               │                  │                    │──dispatch()──────→│                     │                    │
 │               │                  │                    │                   │─TaskStore.create()   │                    │
 │               │                  │                    │                   │─[Hook] task.created  │                    │
 │               │                  │                    │                   │─executeTask()        │                    │
 │               │                  │                    │                   │                     │                    │
 │               │                  │                    │                   │─runSession()────────→│                    │
 │               │─createSession(agentName:"coder")─────────────────────────→│                    │
 │               │  (resolve model via slot, filter tools by whitelist)      │                    │
 │               │                  │                    │                   │                     │─agent.run()────────→│
 │               │                  │                    │                   │                     │                    │─stream()→LLM
 │               │                  │                    │                   │                     │                    │←─edit()
 │               │                  │                    │                   │                     │                    │←─write()
 │               │                  │                    │                   │                     │                    │←─end_turn
 │               │                  │                    │                   │                     │←AssistantMessage───│
 │               │                  │                    │                   │←result.text─────────│                    │
 │               │                  │                    │                   │─[Hook] task.completed│                    │
 │               │                  │                    │←─"Task delegated successfully"          │                    │
 │               │                  │                    │                   │                     │                    │
 │               │                  │              Turn 4-5: 继续 delegate 更多子任务...            │                    │
 │               │                  │                    │                   │                     │                    │
 │               │                  │              Turn 6: [Verify]          │                     │                    │
 │               │                  │                    │─stream()→LLM      │                     │                    │
 │               │                  │                    │←─review_call(reviewer)                  │                    │
 │               │                  │                    │──callAgent()─────→│                     │                    │
 │               │                  │                    │                   │─runSession(slot:"critique")──────────────→│
 │               │                  │                    │                   │  (创建 reviewer session, critique 模型)   │
 │               │                  │                    │                   │                     │             review WorkLoop
 │               │                  │                    │                   │                     │←──review result────│
 │               │                  │                    │←─"Review passed"──│                     │                    │
 │               │                  │                    │                   │                     │                    │
 │               │                  │              Turn 7: bash("pnpm test")│                     │                    │
 │               │                  │              Turn 8: [Conclude] end_turn                    │                    │
 │               │                  │                    │                   │                     │                    │
 │               │                  │←─AssistantMessage──│                   │                     │                    │
 │               │                  │─persistNewMessages()                   │                     │                    │
 │               │                  │─[Hook] session.idle → lesson extraction│                     │                    │
 │←─result───────│                  │                    │                   │                     │                    │
```

### 关键模块交互总结

| 阶段 | 涉及模块 | 说明 |
|------|----------|------|
| **App 初始化** | `VitaminApp` (`coding/app`) | 装配 settings、providers、hooks、prompt、orchestrator、tools、sessions |
| **Model 解析** | `ModelRegistry` + `ModelSlot` (`@vitamin/ai`) | 从 settings → slot → model 优先级链解析 |
| **Prompt 组装** | `PromptManager` (`@vitamin/prompt`) + `lead-guidance` files | 6 个 section 按序拼接 + Hook 增强 |
| **Hook 增强** | `HookRegistry` (`@vitamin/hooks`) | 31+ 拦截点，`system-prompt.transform` / `tool.execute.before` 等 |
| **会话管理** | `CodingSessionManager` + `SessionManager` (`@vitamin/session`) | 内存/磁盘/远端三种后端 |
| **Agent 循环** | `Agent` + `workLoop` (`@vitamin/agent`) | stream → tool_use → tool_result → stream 循环 |
| **工具执行** | `ToolExecutor` (`@vitamin/agent`) + `ToolRegistry` (`@vitamin/tools`) | 只读并行 + 修改顺序 + Steering 中断 |
| **任务编排** | `Orchestrator` + `TaskExecutor` (`@vitamin/orchestrator`) | 并发控制 + 重试 + 熔断 + 后台任务 |
| **子任务派发** | `task_delegate` / `agent_task` / `review_call` (`@vitamin/tools/orchestration`) | dispatch → runSession → createSession → sub-agent WorkLoop |
| **经验学习** | `OperationalLearningStore` (`@vitamin/memory`) | session.idle 时提取经验 → 下次 lesson-injection |

## 进一步阅读

- 当前设计：[docs/DESIGN.md](docs/DESIGN.md)
- prompt / session 链路：[docs/lead-flow.md](docs/lead-flow.md)
- 方法论提案：[docs/vitamin-agent-methodology-portability-2026-04-02.md](docs/vitamin-agent-methodology-portability-2026-04-02.md)
- 导出面：[src/index.ts](src/index.ts)
- 应用容器：[src/app/vitamin-app.ts](src/app/vitamin-app.ts)
- 会话管理：[src/session/coding-session-manager.ts](src/session/coding-session-manager.ts)

## License

See root README for details.