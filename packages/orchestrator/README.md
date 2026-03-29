# @vitamin/orchestrator — 多 Agent 编排层技术方案

> **综合分析** [obra/superpowers](https://github.com/obra/superpowers) (v5.0.6, 118k★) 与 [langchain-ai/deepagents](https://github.com/langchain-ai/deepagents) (v0.5.0, 17.8k★) 的编排设计，结合 vitamin 当前实现，形成统一的多 Agent 调度内核方案。

> **实现状态快照 (2026-03-28)**
> - **Phase 1 已落地**: `AgentRegistry`、`Dispatcher`、`BackgroundManager`、内部 `eventBus`、`bootstrapOrchestrator()`、`task_delegate`/`agent_call`/`task_*`/`background_*` 回调接线。
> - **Phase 2 已落地**: `PlanLoader`（Markdown 计划文件解析/步骤跟踪/prompt 注入）、`CheckpointStore`（任务级 checkpoint 持久化/内存实现）、`ClarifyChannel`（受控澄清通道/次数限制）、`performWork` 完整实现（加载计划→执行步骤→保存进度→emit 事件）、`agent_call.sessionId` 会话复用、扩展事件模型（`plan.*`/`task.recovered`）。
> - **Phase 3 已落地**: `ReviewGate`（可插拔检查器链：spec→quality→test→custom，spec 失败阻断后续）、`RoutingStrategy`（capability 匹配/model tier/composite 路由器）、`RetryStrategy`（exponential/linear/none backoff）、`CircuitBreaker`（closed→open→half_open 状态机）。
> - **测试覆盖**: 190 个测试全部通过，TypeScript 类型检查零错误。
>
> Phase 2/3 核心能力已全部实现并通过测试。后续可继续完善的方向：运行时与 `@vitamin/cli` 的装配闭环、`PlanFileStore` 的文件系统实现、摘要/context budget 策略等。

---

## 目录

1. [背景与动机](#1-背景与动机)
2. [外部方案深度分析](#2-外部方案深度分析)
3. [vitamin 当前基线](#3-vitamin-当前基线)
4. [三方对比矩阵](#4-三方对比矩阵)
5. [功能重叠分析](#5-功能重叠分析)
6. [接入方案](#6-接入方案)
7. [目标架构](#7-目标架构)
8. [核心数据模型](#8-核心数据模型)
9. [编排流程详述](#9-编排流程详述)
10. [状态机与恢复策略](#10-状态机与恢复策略)
11. [上下文管理与摘要](#11-上下文管理与摘要)
12. [与现有包的契约](#12-与现有包的契约)
13. [可观测性与安全](#13-可观测性与安全)
14. [分阶段实施路径](#14-分阶段实施路径)
15. [API 摘要(TypeScript)](#15-api-摘要typescript)
16. [设计取舍](#16-设计取舍)

---

## 1. 背景与动机

vitamin 生态中编排相关能力已分散在多个包中，但缺少统一调度内核：

| 包 | 已有能力 | 缺口 |
|---|---------|------|
| `@vitamin/agent` | 单 Agent work loop、15 种生命周期事件、断点调试 | 无多 Agent 协调能力 |
| `@vitamin/tools` | 9 个编排工具接口(task_delegate/agent_call/perform_work/task_CRUD/background_*) | 回调实现全部为空桩 |
| `@vitamin/hooks` | 30 个内置 Hook(stream/compaction/background/tool_error/token_budget + 12 编排级) | 已通过 bridgeEventBusToHooks 统一接入 |
| `@vitamin/coding` | CodingSessionManager 多会话管理、持久化、Fork | 无跨会话编排 |
| `@vitamin/cli` | 已声明 `AgentRegistry`, `Dispatcher`, `BackgroundManager` 类型依赖 | 运行时装配尚未在 app/bootstrap 层闭环 |

**核心问题**: `@vitamin/tools` 的 `RegisterBuiltinOptions` 要求注入 `dispatchTask`/`performWork`/`callAgent` 等回调，当前 `@vitamin/orchestrator` 已提供其中大部分 Phase 1 回调实现，但 `performWork`、review gate、checkpoint、计划协议等更高阶编排能力仍未完成。`@vitamin/cli` 的 `Subsystems` 类型依赖已经存在，当前缺口主要在运行时装配与 Phase 2/3 能力闭环。

---

## 2. 外部方案深度分析

本节只保留影响 vitamin 设计决策的结论；更偏方法论层面的取舍见 16 节。

### 2.1 superpowers — 借鉴点

superpowers 对 vitamin 最有价值的不是宿主形态，而是软件交付流程约束。对当前方案真正有影响的只有 5 点：

- **Plan as Contract**: 计划不是待办列表，而是执行契约；这直接影响 Phase 2 仍采用 Markdown 计划文件而不是自由式 `write_todos`。
- **Two-stage Review**: 先规格符合性，再代码质量；这构成 Phase 3 `ReviewGate` 的来源。
- **Implementer Status**: `done` / `done_with_concerns` / `needs_context` / `blocked` 这类 richer status 比 success/fail 更适合编排决策。
- **Model Tiering**: 按任务复杂度路由模型，后续可沉淀为 `AgentRegistry` / routing strategy 的策略输入。
- **No-parallel-impl**: 对同一实现域避免并行子代理写入，减少冲突与返工。

不直接照搬的部分也需要明确：vitamin 不复制 superpowers 的 skills-first 宿主形态，也不把 git worktree 作为 orchestrator 的内建前提。

### 2.2 deepagents — 借鉴点

deepagents 对 vitamin 最有价值的是运行时编排边界，而不是 LangGraph 本身。当前设计主要吸收 4 点：

- **Subagent Context Isolation**: 子代理不继承父对话历史，当前 Phase 1 已通过隔离 `AgentSession` 落地。
- **Final-result Handback**: 父代理只消费子代理最终文本，不回灌完整中间过程。
- **Fallback Agent**: 无匹配 agent 时提供 general-purpose fallback，当前已体现在 `AgentRegistry.setFallback()`。
- **Checkpoint / Summarization 方向**: 作为 Phase 2 的接口设计来源，但当前不把 LangGraph runtime、中间件栈或 `write_todos` 直接引入 vitamin。

对摘要和 checkpoint 的借鉴要结合当前实现边界理解：摘要能力目前仍取决于上层 session/memory 装配，checkpoint 也仍是未来接口，不是现有能力。

### 2.3 结论

综合两者后，vitamin 当前的选择可以概括为：

- 从 superpowers 借流程约束，不借宿主工作流。
- 从 deepagents 借运行时边界，不借 LangGraph 运行时。
- orchestrator 保持轻量，负责调度、状态、路由和事件；计划、memory、skill runtime 仍由上层或相邻包承担。

---

## 3. vitamin 当前基线

### 3.1 已有能力详情

**Agent Work Loop** (`@vitamin/agent`)
- `workLoop()` 管理 streaming + tool execution 循环
- 15 种 `AgentEvent` 覆盖全生命周期
- `transformContext` 回调支持外部驱动的上下文压缩
- `Devtools` 集成 24 个断点位置
- `maxToolTurns` 安全阀 (默认 25)

**Orchestration Tool Surface** (`@vitamin/tools`)
- 9 个编排工具全部采用**回调注入模式** — 工具本身是纯壳，实际逻辑由外部注入：
  - `createTaskDelegate(projectRoot, dispatch: TaskDispatch)` — 支持 sync/background 两种模式
  - `createAgentCall(projectRoot, call: CallAgent)` — 支持 sync/async + sessionId
  - `createPerformWork(projectRoot, performWork: PerformWork)` — 计划执行
  - `createTaskCreate/Get/List/Update` — 任务 CRUD
  - `createBackgroundOutputTool/CancelTool` — 后台任务管理
- `RegisterBuiltinOptions` 聚合所有回调类型，通过 `registerBuiltinTools()` 统一注册
- 三级预设: `minimal`(FS+Shell) ⊂ `standard`(+Search+task_delegate) ⊂ `full`(+所有编排+Skill)

**Hook System** (`@vitamin/hooks`)
- `HookRegistry` 支持 24 个内置 Hook
- 已有 background.start/background.end、stream metrics、compaction、token budget 等
- 可通过 preset 机制按需启用

**Session Management** (`@vitamin/coding`)
- `CodingSessionManager` 包装 `@vitamin/session` 的 `SessionManager`
- 支持文件持久化和纯内存模式
- 支持 fork、list、delete、多会话并发

### 3.2 当前缺口

1. **运行时装配未闭环** — `createOrchestrator()` / `bootstrapOrchestrator()` 已存在，但 app/bootstrap 层尚未把 `toolRegistry`、`sessionFactory`、CLI `Subsystems` 组装成统一入口。
2. ~~**`performWork` 未落地**~~ → ✅ 已通过 `PlanLoader` + `CheckpointStore` 实现：加载 Markdown 计划文件、逐步派发、保存 checkpoint、emit `plan.*` 事件。需要 `planFileStore` 注入。
3. ~~**编排事件仍是 Phase 1 最小集**~~ → ✅ eventBus 已扩展至 12 种事件，新增 `task.recovered`、`plan.started/step_completed/completed`、`review.requested/passed/failed`。
4. ~~**`agent_call.sessionId` 尚未生效**~~ → ✅ `AgentRegistry.call()` 已支持 `sessionId` 复用：优先 `sessionFactory.getSession(id)`，命中时复用既有会话且不清理。
5. ~~**缺少需求澄清通道**~~ → ✅ `ClarifyChannel` 已实现，支持结构化请求、per-task 次数限制、审计历史。尚未作为工具暴露给 subagent 运行时。
6. ~~**无 review gate**~~ → ✅ `ReviewGate` 已实现可插拔检查器链（spec→quality→test→custom），spec 失败阻断后续。尚未与 `performWork`/Dispatcher 运行时闭环。
7. ~~**无 checkpoint / 恢复**~~ → ✅ `CheckpointStore` 接口 + 内存实现已完成；`performWork` 每步完成后自动保存 checkpoint。恢复流程（从 checkpoint resume）尚未实现。
8. **结果模型仍偏扁平** — `task.completed` 事件已声明 `subagentResult?: SubagentResult` 字段，但 Dispatcher 运行时尚未赋值，仍以 `TaskOutput` 为主载荷。
9. **Phase 3 构建块未接入管线** — `ReviewGate`、`RoutingStrategy`、`RetryStrategy`/`CircuitBreaker` 作为独立模块已实现并测试通过，但尚未接入 `performWork`/`Dispatcher`/`AgentRegistry.resolve()` 运行时。

---

## 4. 三方对比矩阵

这里只保留影响 vitamin 架构决策的关键维度：

| 维度 | superpowers | deepagents | vitamin (当前方向) |
|------|------------|------------|-------------------|
| **主要借鉴点** | 流程约束与 review discipline | 运行时编排边界 | 两者组合，保持轻量 orchestrator |
| **子代理模型** | fresh subagent per task | 隔离上下文的 `task` 子代理 | `AgentRegistry` 路由 + 隔离 `AgentSession` |
| **计划执行** | Markdown 计划契约 | 扁平任务工具 | Markdown 计划文件 + 轻量调度层 |
| **质量门禁** | Two-stage review | 无内置 | `ReviewGate` 为 Phase 3 扩展点 |
| **上下文管理** | 依赖宿主流程约束 | 自动摘要 + 历史外置 | 由上层 session/memory 装配提供 |
| **恢复与持久化** | 基本无状态 | Checkpointer / Store | `CheckpointStore` 为 Phase 2 扩展点 |
| **运行时形态** | skills/workflow | LangGraph runtime | TypeScript 包 + callback 注入 |

---

## 5. 功能重叠分析

orchestrator 设计必须避免与已有包产生职责重叠。以下逐一分析所有潜在冲突，给出**结论和边界划分**。

### 5.1 边界结论

第 5 节只保留职责边界结论，避免把相邻包能力再展开一遍：

- **上下文压缩**: 属于 `@vitamin/memory` 与上层 session 装配职责，orchestrator 不重复实现。
- **后台任务观测**: `@vitamin/hooks` 负责观测，`BackgroundManager` 负责控制，两者互补。
- **会话管理**: `Dispatcher` / `AgentRegistry` / `BackgroundManager` 复用 `CodingSessionManager` 创建隔离子会话，不复制 session 生命周期管理。
- **Agent 实例化**: `@vitamin/agent` 负责底层工厂，`AgentRegistry` 负责元数据注册、路由和 fallback。
- **Skill 接入**: 当前只能通过外部 `SkillAdapter` 桥接，不能直接假设 `@vitamin/coding` 已提供 `loadSkill` / `executeSkill` 运行时入口。
- **编排事件**: orchestrator 内部 `eventBus` 基于 `@vitamin/shared` TypedEventEmitter；全部 15 种编排事件通过 `bridgeEventBusToHooks` 统一桥接到 `@vitamin/hooks`，已扩展 12 种编排级 `HookTiming`。

### 5.7 重叠分析汇总

| 能力域 | 已有包 | orchestrator 是否新建 | 关系 |
|-------|--------|---------------------|------|
| 上下文压缩/摘要 | `@vitamin/memory` MemoryManager | **否** | 由上层按需接入，orchestrator 不重复实现 |
| 后台任务观测 | `@vitamin/hooks` BackgroundTracker | **否** | 互补：hooks 观测 + orchestrator 控制 |
| 会话 CRUD/Fork | `@vitamin/coding` CodingSessionManager | **否** | orchestrator 是消费者 |
| Agent 实例化 | `@vitamin/agent` createAgent | **否** | 底层工厂，AgentRegistry 调用它 |
| Skill 加载/注册 | `@vitamin/coding` skill/ | **否** | 需新增 SkillAdapter，不能直接桥接 |
| Hook 事件 | `@vitamin/hooks` HookRegistry | **已接入** | 通过 `bridgeEventBusToHooks` 统一桥接，已扩展 12 种编排级 HookTiming |
| 任务状态机 | 无 | **新建** | Dispatcher 核心 |
| Agent 路由注册 | 无 | **新建** | AgentRegistry 核心 |
| 后台任务控制 | 无 | **新建** | BackgroundManager 核心 |
| 计划驱动执行 | 无 | **新建** | LLM prompt + Markdown 计划文件 (Phase 2) |
| 质量门禁 | 无 | **新建** | ReviewGate (Phase 3) |

---

## 6. 接入方案

### 6.1 接入前提

当前接入方案依赖 4 个事实：

1. `VitaminApp` 还不是完整的 `Subsystems` 提供者。
2. `AgentSession` 接收的是显式工具数组，而不是 `ToolRegistry`。
3. `ResourceLoader` 还没有 `loadSkill` / `executeSkill` 运行时入口。
4. `@vitamin/hooks` 已扩展 12 种编排级 `HookTiming`，通过 `bridgeEventBusToHooks` 统一桥接。

因此 orchestrator 更适合作为**应用装配层中的中间编排层**，而不是直接塞进现有 `VitaminApp.start()`。

### 6.2 推荐装配方式

Phase 1 最稳妥的做法是：

- 先由 app/CLI 组合根创建 `ToolRegistry`。
- 用 `bootstrapOrchestrator()` 创建 `AgentRegistry`、`Dispatcher`、`BackgroundManager` 与 tools callbacks。
- 用 `registerBuiltinTools()` 把 callbacks 注入工具层。
- 把 `agentRegistry` / `taskDispatcher` / `backgroundManager` 组装进 CLI 需要的 `Subsystems`。

保留一个最关键的组合根示例即可：

```typescript
async function createSubsystems(app: VitaminApp, deps: {
  toolRegistry: ToolRegistry
  skillAdapter: SkillAdapter
  providerRegistry: ProviderRegistry
}) {
  await app.start()

  const { orchestrator, callbacks } = bootstrapOrchestrator({
    sessionFactory: app.sessionManager,
    toolRegistry: deps.toolRegistry,
    hooks: app.hooks,
    maxConcurrent: app.config?.orchestrator?.maxConcurrent ?? 5,
    skillAdapter: deps.skillAdapter,
    agents: app.config?.agents ?? [],
    fallbackAgent: {
      name: 'general',
      description: 'General-purpose coding agent',
      model: app.config?.model ?? DEFAULT_MODEL,
      capabilities: ['code', 'file', 'shell'],
    },
  })

  registerBuiltinTools(deps.toolRegistry, app.workspaceDir, callbacks)

  return {
    config: app.config!,
    providerRegistry: deps.providerRegistry,
    toolRegistry: deps.toolRegistry,
    hookRegistry: app.hooks,
    agentRegistry: orchestrator.agentRegistry,
    taskDispatcher: orchestrator.dispatcher,
    backgroundManager: orchestrator.backgroundManager,
  }
}
```

### 6.3 产品入口建议

参考 superpowers 与 deepagents 的共性，vitamin 推荐采用“lead session 驱动、orchestrator 调度”的装配模型，而不是“用户直接调用 dispatcher”：

```text
user prompt
  -> vitamin.lead(userPrompt)
  -> lead session.prompt()
  -> lead agent 产出 plan / clarify / delegate 决策
  -> orchestrator.dispatcher.dispatch()
  -> child session 执行子任务 + ReviewGate 审查
  -> structured result handback
  -> lead session review + final answer
  -> LeadResult { status, output, tasks }
```

具体边界如下：

- `vitamin.lead()` / `AgentSession.prompt()` 是产品入口，承载用户对话、需求理解、计划生成与最终答复
- `Dispatcher.dispatch()` 是控制面入口，承载任务级调度与 ReviewGate 质量审查，不直接承担用户会话语义
- `AgentRegistry` 负责把任务路由到合适的 child agent / fallback agent
- `BackgroundManager` 负责后台生命周期，不暴露为首选用户入口

因此，`@vitamin/orchestrator` 的合理定位不是“替代 session”，而是“被 lead session 驱动的调度内核”。

### 6.4 运行时接入约束

- `Dispatcher`、`AgentRegistry`、`BackgroundManager` 都通过 `sessionFactory.createSession(...)` 创建隔离子会话，再调用 `session.prompt(...)` 执行。
- 工具白名单始终先经 `toolRegistry.filterByNames(...)` 解析，再传入 `createSession()`。
- 全部编排事件通过 `bridgeEventBusToHooks` 统一桥接到 `@vitamin/hooks`；后台任务观测与编排事件共用同一桥接通道。
- `BackgroundManager.cancel()` 当前依赖 `AgentSession.abort()` 协作式取消；如果以后 `prompt()` 支持 `AbortSignal`，再升级为统一取消模型。

### 6.5 与相邻系统的接线边界

- **CLI**: 运行时仍需要组合根创建 `Subsystems`；CLI 目前只有类型依赖，不是自动装配。
- **memory**: 是否启用 `MemoryManager` 取决于上层 `messages.transform` / `SessionFactory` 装配，orchestrator 只消费结果，不直接驱动压缩。
- **hooks**: 全部 15 种编排事件（`task.* / review.* / plan.* / clarify.*`）通过 `bridgeEventBusToHooks` 统一桥接到 `@vitamin/hooks`。
- **tools**: 编排与 skill 回调通常在初始化时一次性注入；`registerBuiltinTools()` 之后，session 侧仍需显式选择工具数组。

### 6.6 依赖方向

- `@vitamin/orchestrator` 只依赖 `SessionFactory` / `ToolRegistryHandle` / `HookRegistryHandle` 等抽象接口。
- `@vitamin/coding` / app bootstrap 层负责把具体的 `CodingSessionManager`、`ToolRegistry`、`HookRegistry` 适配进去。
- 这种控制反转设计的目的，是避免 orchestrator 直接 import coding 具体实现，降低循环依赖风险。

---

## 7. 目标架构

### 7.1 系统边界

```
┌─────────────────────────────────────────────────────────┐
│  @vitamin/coding (应用容器)                               │
│  ┌──────────────────────────────────────────────────────┐│
│  │  CodingSessionManager                                ││
│  │    ├── AgentSession  ────────────── @vitamin/agent   ││
│  │    │     └── workLoop()                              ││
│  │    │                                                 ││
│  │    └── Subsystems ─────────── @vitamin/orchestrator  ││
│  │          ├── AgentRegistry                           ││
│  │          ├── Dispatcher                              ││
│  │          └── BackgroundManager                       ││
│  └──────────────────────────────────────────────────────┘│
│                           │                               │
│                    注入回调 │                               │
│                           ▼                               │
│  ┌──────────────────────────────────────────────────────┐│
│  │  @vitamin/tools                                      ││
│  │    registerBuiltinTools(registry, root, {            ││
│  │      dispatchTask,  ← Dispatcher.dispatch()          ││
│  │      callAgent,     ← AgentRegistry.call()           ││
│  │      performWork,   ← PlanLoader + Dispatcher 驱动   ││
│  │      createTask,    ← Dispatcher.create()            ││
│  │      getTask,       ← Dispatcher.get()               ││
│  │      listTasks,     ← Dispatcher.list()              ││
│  │      updateTask,    ← Dispatcher.update()            ││
│  │      getBackgroundOutput, ← BackgroundManager.output()││
│  │      cancelBackground,    ← BackgroundManager.cancel()││
│  │    })                                                ││
│  └──────────────────────────────────────────────────────┘│
│                           │                               │
│                    事件发布 │                               │
│                           ▼                               │
│  ┌──────────────────────────────────────────────────────┐│
│  │  eventBus (extends TypedEventEmitter) → @vitamin/hooks ││
│  │    bridgeEventBusToHooks: 15 种编排事件统一桥接        ││
│  │    task.* / plan.* / review.* / clarify.*             ││
│  └──────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────┘
```

### 7.2 核心组件

#### AgentRegistry
- 维护 agent 元数据 (name, description, capabilities, model tier, tool whitelist)
- 按名称精确路由 / 按 category 模糊路由
- 提供 fallback agent (类似 deepagents 的 general-purpose subagent)

#### Dispatcher
- 接收任务请求并创建 `OrchestratorTask`
- 根据 mode (sync/background) 分发到不同执行路径
- 维护任务状态机、重试策略、并发配额
- 提供 task CRUD API (create/get/list/update)

#### BackgroundManager
- 管理后台任务的生命周期
- 提供 output 轮询 / cancel 操作
- 支持任务完成事件通知
- 通过 bridgeEventBusToHooks 与 @vitamin/hooks 对接

#### Phase 2/3 扩展点
- `Plan` 驱动: 以 Markdown 计划文件作为执行契约，不引入代码级 DAG 引擎
- `ReviewGate`: 以 two-stage review 为原型的可插拔质量门禁
- `CheckpointStore`: 为恢复、resume 和 plan 级重试提供持久化支点

---

## 8. 核心数据模型

### 8.1 OrchestratorTask

这一节区分“当前已稳定类型”和“后续预留字段”。

```typescript
interface OrchestratorTask {
  id: string
  kind: 'delegate' | 'agent_call' | 'plan' | 'adhoc'
  status: TaskStatus
  mode: 'sync' | 'background'

  // 输入
  input: {
    prompt: string
    subagent?: string
    category?: string
    planRef?: string
    sessionId?: string
  }

  // 输出
  output?: {
    text: string
    artifacts?: Record<string, unknown>
    summary?: string  // ← 借鉴 deepagents 的结果摘要
  }

  // 错误
  error?: {
    code: string
    message: string
    retriable: boolean
  }

  // 执行信息
  attempts: number
  maxAttempts: number
  parentTaskId?: string
  correlationId: string

  // 时间戳
  createdAt: number
  startedAt?: number
  endedAt?: number
}

type TaskStatus =
  | 'pending'
  | 'running'
  | 'waiting_review'  // ← 借鉴 superpowers 的 review gate
  | 'completed'
  | 'failed'
  | 'cancelled'
```

说明：`waiting_review` 已存在于当前导出类型中，但 Phase 1 运行时尚未进入该状态；它目前更接近为 Phase 3 review gate 预留的状态位。

### 8.2 子代理结果 (借鉴 superpowers + deepagents)

```typescript
// 借鉴 superpowers 的 implementer status
type SubagentResultStatus =
  | 'done'
  | 'done_with_concerns'
  | 'needs_context'
  | 'blocked'

interface SubagentResult {
  status: SubagentResultStatus
  output: string              // 最终输出文本
  concerns?: string           // DONE_WITH_CONCERNS 时的疑虑
  missingContext?: string     // NEEDS_CONTEXT 时需要的信息
  blockReason?: string        // BLOCKED 时的原因
}
```

说明：`SubagentResult` 当前已作为导出类型存在，但 Phase 1 运行时仍以 `TaskOutput` 作为任务完成载荷；结构化结果回传仍属于后续演进方向。

### 8.3 Plan (Phase 2)

`PlanFile` 已在 `src/plan-loader.ts` 中实现。`parsePlanFile()` 从 Markdown 提取 `### Task N:` 结构化步骤、`**Files:**` 文件清单、复选框状态。`buildStepPrompt()` 把当前步骤 + 进度 + 目标注入 prompt。核心约束：

- 计划文件采用 Markdown 作为执行契约，而不是代码级 DAG。
- 计划文件由 `performWork` 加载后，通过 `Dispatcher.dispatch()` 逐步执行；每步完成后更新状态并保存 checkpoint。

---

## 9. 编排流程详述

### 9.1 task_delegate 流程

```
User/Agent → task_delegate(prompt, subagent?, category?, mode)
    │
    ├── Dispatcher.dispatch(args)
    │   ├── 1. 创建 OrchestratorTask(kind='delegate')
    │   ├── 2. AgentRegistry.resolve(subagent || category)
    │   │       ├── 精确匹配 subagent name
    │   │       ├── category 匹配 → 选择最佳 agent
    │   │       └── 无匹配 → fallback agent
    │   ├── 3. mode 判断
    │   │   ├── sync → 创建隔离 AgentSession → session.prompt() → 收集最终文本
    │   │   └── background → BackgroundManager.submit() → 返回 taskId
    │   └── 4. 发布事件 task.created → task.started → task.completed/failed
    │
    └── 返回 TaskDispatchResult { success, output/id, status }
```

当前要点：隔离子会话只收到任务 prompt，不继承父对话历史；工具集由 `AgentRegistry` 配置经 `toolRegistry.filterByNames(...)` 解析后注入。

### 9.2 agent_call 流程

```
Agent → agent_call(agent, prompt, { mode, sessionId })
    │
    ├── AgentRegistry.get(agent)
    │   └── 获取 agent 配置: model, tools, systemPrompt, capabilities
    │
    ├── mode=sync:
    │   ├── 创建隔离 AgentSession
    │   ├── session.prompt(prompt)
    │   └── 返回 { success: true, output: lastAssistantText }
    │
    └── mode=async:
        ├── BackgroundManager.submit(agentConfig, prompt)
        └── 返回 { success: true, output: 'Submitted as background task' }
```

补充：`sessionId` 参数已在 Phase 2 实现。`AgentRegistry.call()` 会优先调用 `sessionFactory.getSession(sessionId)` 尝试复用既有会话；命中时不在调用结束后清理该会话。

### 9.3 perform_work 流程

已实现。`performWork(name)` 的运行时流程：

```
performWork(planPath)
    │
    ├── planLoader.load(planPath)       ← 从 PlanFileStore 读取 Markdown、解析为 PlanFile
    ├── planLoader.getNextStep(planId)  ← 查找第一个 status='pending' 的步骤
    │
    ├── 首步时 emit('plan.started', { planId, totalSteps })
    ├── planLoader.updateStep(stepId, 'in_progress')
    ├── buildStepPrompt(plan, step)     ← 注入进度、目标、文件清单
    │
    ├── dispatcher.dispatch({ prompt, mode:'sync' })
    │   ├── 成功 → updateStep('completed') → emit('plan.step_completed')
    │   │         → checkpointStore.save() → 检查全部完成 → emit('plan.completed')
    │   │         → planLoader.save() 持久化到 PlanFileStore
    │   └── 失败 → updateStep('failed') → 返回错误
    │
    └── 返回 { success, taskId, message }
```

调用方应循环调用 `performWork(samePlan)` 以逐步推进执行；每次调用只执行一个步骤。

---

## 10. 状态机与恢复策略

Phase 2 已实现 checkpoint 恢复（`createMemoryCheckpointStore`），Phase 3 已实现 `ReviewGate` 构建块（尚未接入状态机的 `waiting_review` 流转）。当前运行时实际使用的状态仍以 `pending/running/completed/failed/cancelled` 为主。

### 10.1 任务状态机

```
                           ┌──────────┐
                   ┌──────→│ cancelled │
                   │       └──────────┘
                   │
┌─────────┐   ┌───┴───┐   ┌───────────────┐   ┌───────────┐
│ pending  │──→│running │──→│waiting_review │──→│ completed │
└─────────┘   └───┬───┘   └───────┬───────┘   └───────────┘
                   │               │
                   │      review   │ review
                   │      failed   │ passed
                   │       ┌───────┘
                   ▼       ▼
              ┌────────┐
              │ failed  │──→ running (retry, if retriable)
              └────────┘
```

### 10.2 重试与恢复摘要

```typescript
interface RetryPolicy {
  maxAttempts: number        // 默认 3
  backoff: 'exponential' | 'linear' | 'none'
  baseDelayMs: number        // 默认 1000
  maxDelayMs: number         // 默认 30000
  retryableErrors: string[]  // 可重试的 error code 列表
}
```

- 仅对 `error.retriable === true` 的错误自动重试
- 指数退避: delay = min(baseDelay * 2^attempt, maxDelay)
- 达到上限后标记 `failed`，附带可执行补救建议
- 若后续引入 `CheckpointStore`，可扫描未完成任务并从最近 checkpoint 恢复。
- 若后续把 `SubagentResult` 接入运行时，`done_with_concerns` / `needs_context` / `blocked` 将成为编排层重试与升级决策输入。

---

## 11. 上下文管理与摘要

借鉴 deepagents 的上下文隔离思路，orchestrator 当前已实现的是“子代理独立会话 + 最终文本回传”；自动摘要仍取决于上层 session/memory 装配：

### 11.1 子代理上下文隔离

```typescript
// Dispatcher / AgentRegistry / BackgroundManager 的共同模式：
// 先把 AgentSpec.tools 中的工具名解析为实际工具，再创建隔离子会话。
const tools = toolRegistry.filterByNames(agentSpec.tools ?? [])

const session = await sessionFactory.createSession({
  model: agentSpec.model,
  systemPrompt: agentSpec.systemPrompt,
  tools,
})

await session.prompt(task.input.prompt)
```

设计结论：subagent 默认不应与 main/lead agent 保持自由对话。原因不是“完全不能通信”，而是要避免三类问题：
- 隔离边界被破坏，subagent 逐步退化成共享主会话的分支。
- 需求澄清过程不可审计，主代理临时补充的口头约束无法沉淀为任务状态。
- 后续若引入 `sessionId` 复用、checkpoint、review gate，自由对话会显著增加恢复与重放复杂度。

更合适的模型是：默认单次委派、单次结果回传；当 subagent 判断 `needs_context` 或 `blocked` 时，通过受控工具请求补充上下文，而不是直接把 lead agent 当作普通聊天对象。

### 11.1.1 建议新增 clarify_requirement 工具 (Phase 2)

推荐新增一个面向 subagent 的窄接口工具，例如 `clarify_requirement` / `request_context`，语义上等同“向父任务请求补充说明”，而不是“与 main agent 自由对话”。

建议形态：

```typescript
interface ClarifyRequirementArgs {
  taskId: string
  question: string
  reason?: 'missing_context' | 'conflicting_constraints' | 'approval_needed'
}

interface ClarifyRequirementResult {
  success: boolean
  answer?: string
  escalation?: 'lead_agent' | 'user' | 'planner'
  error?: string
}
```

建议约束：
- 只允许关联当前 `taskId` / `parentTaskId` / `correlationId`，不暴露主会话完整历史。
- 返回值应是结构化补充信息，而不是把 lead agent 的整段中间推理原样转发给 subagent。
- 每个任务限制澄清次数，避免 subagent 反复追问导致主代理重新接管执行。
- 澄清记录应落入任务事件或任务元数据，供 review/checkpoint 使用。

不建议直接复用 `agent_call` 让 subagent 去调用 main/lead agent。`agent_call` 面向的是“调用另一个能力代理做执行”，而不是“回父级请求任务定义补充”；两者的审计边界、上下文暴露面和失败处理都不同。

### 11.2 结果摘要回传

子代理执行完成后，仅回传最终输出的摘要文本：

```typescript
// 借鉴 deepagents: SubAgent 返回的最后一条消息被提取为 ToolMessage
function extractSubagentResult(assistantMessage: AssistantMessage): SubagentResult {
  return {
    status: 'done',
    output: assistantMessage.content.text,
  }
}
```

### 11.3 长上下文自动压缩

vitamin 已有 `transformContext` 回调：

```typescript
// work-loop 中的压缩入口
interface AgentRunContext {
  transformContext?: (messages: AgentMessage[], signal?: AbortSignal) => Promise<AgentMessage[]>
}
```

orchestrator 可在此基础上实现：
- 当编排上下文超过阈值时触发摘要
- 将被摘要的消息持久化到 session 存储
- 保留最近 N 条消息 + 摘要消息

---

## 12. 与现有包的契约

### 12.1 与 @vitamin/tools

orchestrator 已提供 `RegisterBuiltinOptions` 所需的回调形状；更完整的接线时序见 6.8，这里只保留当前接口语义结论：

- `dispatchTask`、`callAgent`、`createTask`、`listTasks`、`updateTask`、`getBackgroundOutput`、`cancelBackground` 已接通
- `getTask` 已接通，但返回的是 tool-friendly 映射结果，不是 `dispatcher.get()` 的裸 `OrchestratorTask`
- `performWork` 已实现：通过 `PlanLoader` 加载 Markdown 计划文件，逐步派发到 `Dispatcher`，每步完成后保存 checkpoint。需要 `planFileStore` 注入，否则返回 `NO_PLAN_STORE`
- `ClarifyChannel` 已作为独立模块实现，但尚未作为 `clarify_requirement` 工具暴露给 subagent 运行时
- `loadSkill` / `executeSkill` 依赖外部 `SkillAdapter`；未提供时返回错误，不会自动桥接到 `@vitamin/coding`

### 12.2 与 @vitamin/cli

CLI 当前已声明 `Subsystems` 的 orchestrator 类型依赖，但运行时装配仍需要组合根完成；具体装配方式见 6.5 与 6.2。

### 12.3 与 @vitamin/agent

- **不替代** 单 Agent work loop — orchestrator 在任务级别组织多个 `workLoop()` 调用
- 当前任务对象会记录 `correlationId`，为后续跨层观测留出关联键
- devtools 编排级断点仍是 Phase 3 规划，当前 orchestrator 尚未向 agent 调试器注入额外断点

### 12.4 与 @vitamin/hooks

已通过 `bridgeEventBusToHooks` 将全部编排事件统一桥接到 `@vitamin/hooks`，并扩展 12 种编排级 `HookTiming`（`task.created/started/completed/failed/cancelled/recovered`、`plan.started/step_completed/completed`、`review.requested/passed/failed`）。当前事件类型定义：

```typescript
// 当前已实现的 orchestrator 事件（全部在 eventBus 中活跃）
type OrchestratorEventMap = {
  // Phase 1: 任务生命周期
  'task.created':     { task: OrchestratorTask }
  'task.started':     { task: OrchestratorTask; agent: string }
  'task.completed':   { task: OrchestratorTask; result: TaskOutput; subagentResult?: SubagentResult }
  'task.failed':      { task: OrchestratorTask; error: TaskError }
  'task.cancelled':   { taskId: string }
  // Phase 2: checkpoint 恢复
  'task.recovered':   { task: OrchestratorTask; fromCheckpoint: string }
  // Phase 2: 计划生命周期
  'plan.started':     { planId: string; totalSteps: number }
  'plan.step_completed': { planId: string; stepId: string; remaining: number }
  'plan.completed':   { planId: string }
  // Phase 3: review 门禁
  'review.requested': { taskId: string; reviewType: string }
  'review.passed':    { taskId: string; reviewType: string }
  'review.failed':    { taskId: string; reviewType: string; issues: string[] }
}
```

当前与 hooks 的协作架构：
- `OrchestratorEventBus` 继承 `@vitamin/shared` 的 `TypedEventEmitter`，覆写 `emit` 为异步（`await Promise.all`）
- `bridgeEventBusToHooks(eventBus, hooks)` 将全部 15 种编排事件桥接到 `HookRegistry.emit()`
- `createOrchestrator()` 在创建时自动接线：当 `options.hooks` 存在时调用 `bridgeEventBusToHooks`

### 12.5 与 @vitamin/coding

- 复用 `CodingSessionManager` 的 session 语义管理子代理会话
- `ResourceLoader` / skill runtime 目前尚未直接接入 orchestrator；这部分仍属于适配层需求
- `AgentRegistry.call()` 已支持 `sessionId` 复用：当 `sessionFactory` 实现了 `getSession()` 时（如 `CodingSessionManager`），会尝试复用已有会话而不是始终创建新会话

---

## 13. 可观测性与安全

### 13.1 事件与指标

Phase 1 当前可观测事件：

| 事件 | 来源 | 说明 |
|------|------|------|
| `task.created` | orchestrator eventBus | Dispatcher 创建任务 |
| `task.started` | orchestrator eventBus | 同步任务开始或后台任务提交进入运行态 |
| `task.completed` | orchestrator eventBus | 任务成功完成 |
| `task.failed` | orchestrator eventBus | 任务失败 |
| `task.cancelled` | orchestrator eventBus | 后台任务被取消 |
| `background.start` | HookRegistry | BackgroundManager 提交后台任务时桥接发射 |
| `background.end` | HookRegistry | 后台任务完成/失败时桥接发射 |

Phase 2/3 新增的编排事件（`plan.started`/`plan.step_completed`/`plan.completed`/`review.requested`/`review.passed`/`review.failed`/`task.recovered`）已进入 `eventBus`，可被外部订阅。但 `background.submitted`、`agent_call.started/completed`、`review.verdict` 等更细粒度的指标事件仍未实现，不应视为现有观测面。

### 13.2 安全边界

借鉴 deepagents "trust the model, enforce at tool boundary" 原则：

| 层面 | 机制 |
|------|------|
| 工具权限 | 子代理按 `AgentRegistry` 配置获得最小工具集 |
| 目录沙箱 | 通过 `projectRoot` 参数限制文件操作范围 |
| 命令白名单 | bash 工具可配置允许/禁止命令列表 |
| Token 预算 | 借鉴 hooks 的 `createTokenBudgetHook()` |
| 并发配额 | `Dispatcher.maxConcurrent` 当前只限制同步 dispatch 路径；后台任务尚未纳入同一并发闸门 |
| 超时控制 | 任务级 timeout + agent 级 `maxToolTurns` |
| 审计追踪 | 每个 `correlationId` 关联的操作链完整记录 |

---

## 14. 分阶段实施路径

### Phase 1: 统一接口与内存实现

**目标**: 填补 CLI 类型依赖、接通 tools 回调、最小可用。

**交付物**:
- `src/types.ts` — `OrchestratorTask`, `TaskStatus`, `SubagentResult`, `AgentSpec`
- `src/agent-registry.ts` — 内存 AgentRegistry (register/get/resolve/call)
- `src/dispatcher.ts` — 内存 Dispatcher (dispatch/create/get/list/update)
- `src/background-manager.ts` — 内存 BackgroundManager (submit/getOutput/cancel)
- `src/index.ts` — 统一导出

**验收标准**:
- `@vitamin/cli` typecheck 通过
- `task_delegate`/`agent_call`/`task_*` 在真实会话可跑通
- `background_output`/`background_cancel` 可用
- 事件: task.created/started/completed/failed 可通过 orchestrator eventBus 订阅；background.start/end 自动桥接 HookRegistry
- `bootstrapOrchestrator` 返回的 callbacks 可直接传给 `registerBuiltinTools`

> **Phase 1→2 进展**: `performWork` 已实现（PlanLoader 驱动逐步派发 + checkpoint），`sessionId` 已生效（`AgentRegistry.call()` 优先复用既有会话）。仍有待完善：`task.completed` 事件类型已扩展 `subagentResult?: SubagentResult` 字段，但 Dispatcher 运行时尚未给该字段赋值。

### Phase 2: LLM 计划驱动与 Checkpoint

**目标**: 支持 Markdown 计划文件的加载、注入和协议化执行，参照 superpowers 的 Plan as Contract 模式。

**设计原则**: 不实现 DAG/PlanEngine；也不把执行完全交给模型自由发挥。计划文件提供实现契约，skill/prompt 模板提供执行协议，代码层提供加载、派发、状态跟踪和 checkpoint 支撑。

**交付物**:
- `src/plan-loader.ts` — 计划文件加载 + task/chunk 提取 + prompt 注入
- `src/checkpoint-store.ts` — Checkpoint 接口 + 内存实现
- `src/clarify-channel.ts` — subagent → lead/user 的受控需求澄清通道
- 扩展 `OrchestratorTask` 支持 `kind: 'plan'`
- `performWork` 回调对接计划文件加载 + task/chunk 派发
- `agent_call` 的 `sessionId` 支持跨调用上下文复用
- `task.completed` 事件升级为携带结构化 `SubagentResult`

**已完成**:
- ✅ `performWork` 通过 `PlanLoader` + `Dispatcher` 逐步执行计划
- ✅ `plan.*` 事件（`plan.started`/`plan.step_completed`/`plan.completed`）已在 eventBus 中活跃
- ✅ `review.*` 事件由 `ReviewGate` 发射到 eventBus
- ✅ `CheckpointStore` 内存实现，每步完成后自动保存
- ✅ `sessionId` 复用已在 `AgentRegistry.call()` 中生效

**待完善**:
- `ClarifyChannel` 未作为工具暴露给 subagent 运行时
- `ReviewGate` 未接入 `performWork`/Dispatcher 管线
- `RoutingStrategy` 未接入 `AgentRegistry.resolve()`
- `RetryStrategy`/`CircuitBreaker` 未接入 Dispatcher 重试逻辑
- Checkpoint resume/recovery 流程未完整串通（save 已有，resume 入口待实现）

**验收标准**:
- `perform_work` 可加载计划文件并提取当前 task/chunk 上下文
- LLM 可在协议约束下通过 `callAgent`/`dispatchTask` 逐步执行计划
- subagent 在 `needs_context` 场景下可通过受控澄清通道补充需求，而不是直接与 lead agent 自由对话
- 编排层可跟踪任务状态并插入 review/checkpoint 节点
- Checkpoint 支持进程重启后恢复

### Phase 3: Review Gate 与策略层

**目标**: 引入质量门禁和智能路由策略。

**交付物**:
- `src/review-gate.ts` — 可插拔检查器链 (spec/quality/test/custom)
- `src/routing-strategy.ts` — 动态路由策略 (capability/cost/load-balance)
- `src/retry-strategy.ts` — 策略化重试 (exponential/circuit-breaker)
- 对接 devtools 编排级断点

**验收标准**:
- 任务可进入 `waiting_review` 并根据检查结果恢复/失败
- 子代理可按策略动态路由到不同模型
- devtools 可在编排层插入调试断点

---

## 15. API 摘要(TypeScript)

这一节只描述**当前包级导出面**，不再把模块内部辅助类型和未来草案混在一起。若某能力尚未在 Phase 1 运行时生效，会单独标注。

### 15.1 当前包级导出

```typescript
export {
  createAgentRegistry,
  createDispatcher,
  createBackgroundManager,
  createOrchestrator,
  registerAgents,
  bootstrapOrchestrator,
  createEventBus,
  OrchestratorEventBus,
} from '@vitamin/orchestrator'

export type {
  TaskStatus,
  TaskKind,
  TaskMode,
  TaskInput,
  TaskOutput,
  TaskError,
  OrchestratorTask,
  AgentSpec,
  SubagentResultStatus,
  SubagentResult,
  DispatchMode,
  DispatchArgs,
  DispatchResult,
  AgentRegistry,
  Dispatcher,
  BackgroundManager,
  SkillAdapter,
  SessionFactory,
  AgentSessionHandle,
  OrchestratorOptions,
  ToolRegistryHandle,
  HookRegistryHandle,
  OrchestratorEventMap,
  OrchestratorEventType,
  OrchestratorEventHandler,
  Orchestrator,
  ToolCallbacks,
  BootstrapOptions,
  BootstrapResult,
} from '@vitamin/orchestrator'
```

### 15.2 当前最关键的接口语义

```typescript
interface AgentRegistry {
  register(spec: AgentSpec): void
  get(name: string): AgentSpec | undefined
  resolve(query: { name?: string; category?: string }): AgentSpec | undefined
  list(): AgentSpec[]
  call(
    agent: string,
    prompt: string,
    options?: { mode?: 'sync' | 'async'; sessionId?: string },
  ): Promise<{ success: boolean; output?: string; error?: string }>
  setFallback(spec: AgentSpec): void
  setBackgroundManager(bgm: BackgroundManager): void
}

interface Dispatcher {
  dispatch(args: DispatchArgs): Promise<DispatchResult>
  create(args: { prompt: string; category?: string; subagent?: string }): Promise<{ id: string; success: boolean; message?: string; error?: string }>
  get(id: string): Promise<OrchestratorTask | undefined>
  list(status?: string): Promise<{ success: boolean; tasks: Array<{ id: string; prompt: string; status: string }>; error?: string }>
  update(id: string, action: 'cancel' | 'retry'): Promise<{ success: boolean; message: string }>
}

interface BackgroundManager {
  submit(task: OrchestratorTask, spec: AgentSpec): Promise<string>
  getOutput(id: string): Promise<{ status: string; success: boolean; output?: string; error?: string }>
  cancel(id: string): Promise<{ success: boolean; error?: string }>
  list(): OrchestratorTask[]
}

interface Orchestrator {
  readonly agentRegistry: AgentRegistry
  readonly dispatcher: Dispatcher
  readonly backgroundManager: BackgroundManager
  readonly eventBus: OrchestratorEventBus
  readonly planLoader: PlanLoader           // Phase 2: 计划文件加载/状态跟踪
  readonly checkpointStore: CheckpointStore  // Phase 2: 任务级 checkpoint 持久化
  toToolCallbacks(skillAdapter?: SkillAdapter): ToolCallbacks
}
```

### 15.3 需要特别注意的语义

- `SubagentResult` 已导出并加入 `task.completed` 事件类型，但 Dispatcher 运行时尚未给该字段赋值。
- `TaskStatus` 包含 `waiting_review`，但 `ReviewGate` 尚未接入状态机流转，运行时不会进入该状态。
- ~~`callAgent(..., { sessionId })` 当前只保留接口形状~~ → ✅ 已实现：优先调用 `sessionFactory.getSession(id)` 复用已有会话。
- ~~`toToolCallbacks().performWork` 当前固定返回 `NOT_IMPLEMENTED`~~ → ✅ 已实现：PlanLoader + Dispatcher 逐步执行。
- `loadSkill` / `executeSkill` 依赖外部 `SkillAdapter`，不会自动桥接到 `@vitamin/coding`。
- Phase 3 构建块（`ReviewGate`/`RoutingStrategy`/`RetryStrategy`/`ClarifyChannel`）均为独立导出模块，尚未接入运行时管线。

### 15.4 未来扩展点

以下方向已有独立构建块或类型预留，但尚未形成完整运行时闭环，不应被视为当前稳定 API 承诺：

- ~~`performWork` 的计划文件加载与协议化执行~~ → ✅ 已在 Phase 2 落地。
- ~~`CheckpointStore` 及恢复相关事件~~ → ✅ 已在 Phase 2 落地（save 完成，resume 入口待实现）。
- ~~基于 `sessionId` 的跨调用上下文复用~~ → ✅ 已在 Phase 2 落地。
- `ReviewGate` 接入 `waiting_review` 状态机形成真实运行时闭环。
- `RoutingStrategy` 接入 `AgentRegistry.resolve()` 实现动态路由。
- `RetryStrategy` / `CircuitBreaker` 接入 Dispatcher 重试逻辑。
- `ClarifyChannel` 作为 `clarify_requirement` 工具暴露给 subagent。
- `SubagentResult` 在 Dispatcher 运行时中真正赋值到 `task.completed` 事件。

---

## 16. 设计取舍

### 16.1 借鉴 superpowers

| 采纳 | 理由 |
|------|------|
| Plan as Contract | 结构化计划是可靠 DAG 执行的前提 |
| Two-stage Review | 先检查产物是否符合规格，再检查代码质量，减少无效 review |
| Implementer Status 枚举 | 比简单的 success/fail 提供更丰富的决策信息 |
| Model Tiering | 按任务复杂度选择模型，降低成本 |
| No-parallel-impl | 避免并行修改同一代码区域的冲突 |

| 不采纳 | 理由 |
|--------|------|
| Skill as 一等公民 | vitamin 已有独立 `@vitamin/tools` skill 系统 |
| Git worktree per task | vitamin 的 session 模型已提供隔离语义 |
| 强制宿主工作流 | vitamin 只借鉴流程契约，不把 superpowers 的完整宿主流程直接内建进 orchestrator |

### 16.2 借鉴 deepagents

| 采纳 | 理由 |
|------|------|
| SubAgent 隔离上下文 | 子代理不继承父对话历史，防止上下文污染 |
| 结果摘要回传 | 仅返回最终输出，节省父 agent 上下文 |
| General-purpose fallback | 无匹配 agent 时有兜底选项 |
| Auto-summarization threshold | 85%/10% 的触发/保留策略可直接复用 |
| History offload | 被摘要消息持久化，保留完整审计链 |
| "enforce at tool boundary" | 安全控制在工具层而非依赖模型自律 |

| 不采纳 | 理由 |
|--------|------|
| LangGraph 运行时 | vitamin 自走 TypeScript 技术栈 |
| Middleware 架构 | vitamin 已有 Hook 系统，无需第二套中间件 |
| AsyncSubAgent (远程) | v1 不引入分布式调度 |
| write_todos 工具 | vitamin 采用与 superpowers 相同的 Markdown 计划文件约定，由 LLM 生成和执行计划 |

### 16.3 vitamin 自身设计原则

- **组合式包结构** — 每个包职责单一、可独立测试
- **回调注入模式** — tools 只定义接口，orchestrator 提供实现，松耦合
- **工具边界安全** — 安全控制在 `@vitamin/tools` 层执行，orchestrator 配置策略
- **分层可观测性** — orchestrator `eventBus`（基于 `@vitamin/shared` TypedEventEmitter）通过 `bridgeEventBusToHooks` 统一桥接到 `@vitamin/hooks`，30 种 HookTiming 覆盖全链路
- **渐进式复杂度** — Phase 1 先跑通最小编排闭环，Phase 2-3 再逐步引入计划协议、checkpoint、review gate
