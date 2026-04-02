# Vitamin Coding Lead Agent 技术实现方案

> 基于 7 个主流 Agent 框架深度对比，结合 vitamin 现有架构设计
>
> **核心原则：框架没有硬编码的部分不能硬编码，能给大模型决策的不能硬编码**
>
> **最后更新：** 2026-04-02，基于 vitamin 最新源码审计

---

## 〇、当前实现状态总览

> 以下为 2026-04-01 基于 **源码文件系统** 审计的实际状态。orchestrator src/ 为空目录，dist/ 不存在。

### 已实现的基础设施

| 机制 | 位置 | 说明 |
|------|------|------|
| **Agent work-loop** | `agent/src/work-loop.ts` | 双层 while 循环 + steering/followUp 注入 |
| **31 种 Hook Timing** | `hooks/src/types.ts` | 含 task.\*/review.\* 编排器 hook 类型定义（9 种编排事件） |
| **ToolRegistry + 内置工具** | `tools/src/` | minimal/standard/full 三级预设 |
| **9 个编排工具定义** | `tools/src/orchestration/` | task_delegate/agent_call/task_create/get/list/update/bg_output/bg_cancel/clarify_request |
| **RegisterBuiltinOptions 回调接口** | `tools/src/register-builtin.ts` | 声明了所有编排工具的回调类型 |
| **Session DAG + 分支** | `session/src/` | Session branching + 3 种持久化后端 (inMemory/disk/remote) |
| **CodingSessionManager** | `coding/src/session/` | create/get/list/remove/fork + ephemeral/sticky 策略 |
| **Memory 3 层压缩** | `memory/src/` | Persistent → Prune → Compaction+Archive |
| **VitaminApp 容器** | `coding/src/app/vitamin-app.ts` | 组装 agent/tools/hooks/session/memory |
| **AgentSession 封装** | `coding/src/` | 单 agent 完整生命周期管理 |
| **Setting schema (workflow)** | `setting/src/schema/workflow.ts` | review/retry/circuit\_breaker/routing 配置声明 |
| **Setting schema (agents)** | `setting/src/schema/agents.ts` | per-agent: model/description/system_prompt/tools/capabilities/max_tool_turns |
| **Setting schema (categories)** | `setting/src/schema/categories.ts` | per-category: preferred_models/default_model |
| **ModelRegistry** | `ai/src/model-registry.ts` | register/resolve/setDefault |
| **TypedEventEmitter** | `shared/src/event-emitter.ts` | 强类型事件总线 |

### 待实现 / 阻塞项

| 机制 | 状态 | 说明 |
|------|------|------|
| **orchestrator 完整运行时** | ❌ | `orchestrator/src/` 为空，`dist/` 不存在 — 纯占位包 |
| **编排回调实现** | ❌ | vitamin-app.ts 中 taskDispatch/callAgent 返回 `success: false`，orchestration 工具注册后被移除 |
| **package.json 依赖** | ❌ | orchestrator 声明了不存在的 @vitamin/dispatcher 和 @vitamin/plan |
| **tools 编译错误** | ❌ | index.ts 导出了不存在的 plan-create/get/list/update 源文件 |
| **WorkflowSlot 类型** | ❌ | 无源码（web-ui/ModelSlot.tsx 前端选择器已有） |
| **Read-Only Tool Concurrency** | ❌ | work-loop.ts 仍为全串行，AgentTool 无 readonly 字段 |
| **FileState Snapshot** | ❌ | 仅设计 |
| **Operational Learning** | ❌ | 仅设计 |

---

## 一、设计哲学

### 1.1 核心原则：Orchestrator = 基础设施 + 工具回调，不是流程引擎

```
Orchestrator 实现 RegisterBuiltinOptions 中的回调函数，驱动 @vitamin/tools 已定义的编排工具。
LLM 才是编排者 — 它通过调用工具来管理任务、代理和审查。
```

**已确立的集成模式：**
- `@vitamin/tools` 定义工具 schema + 参数验证（✅ 已完成）
- `RegisterBuiltinOptions` 声明回调接口（✅ 已完成）
- `VitaminApp` 注册工具 + 注入回调（⚠️ 已搭建，回调待实现）
- **Orchestrator 的职责 = 实现这些回调 + 提供基础设施（TaskStore、Session 编排、重试、事件广播）**

### 1.2 硬编码 vs. LLM 决策分界线

#### 七大框架验证

通过分析 Superpowers / Deep Agents / OpenDev / gstack / InfiAgent / Open Agent SDK / Pi-mono，发现共性——**没有一个把"何时创建子任务"、"选择哪个 agent"硬编码成运行时状态机**：

| 编排决策 | Superpowers | Deep Agents | Pi-Mono | OpenDev | gstack | InfiAgent | Open Agent SDK |
|---------|-------------|-------------|---------|---------|--------|-----------|---------------|
| **何时创建子任务** | 硬编码（plan step） | ✅ LLM决策 | ✅ LLM决策 | LLM决策 | 硬编码 | 硬编码 | ✅ LLM决策 |
| **选择哪个 agent** | 硬编码（角色） | ✅ LLM决策 | ✅ 无agent概念 | LLM决策 | 硬编码 | 硬编码 | ✅ LLM决策 |
| **何时 review** | 硬编码（HARD-GATE） | ❌ 无 | ❌ 无 | ❌ 无 | 硬编码 | ❌ 无 | ✅ LLM触发 hooks |
| **Phase 流程** | Markdown 指引 | 无 | 无 | 无 | Markdown 指引 | 无 | 无 |
| **Plan 格式** | Markdown（LLM 写） | ✅ write_todos | ❌ 无 | ❌ 无 | Markdown | ❌ 无 | ✅ EnterPlanMode |

#### 该硬编码的 — 运行时基础设施（LLM 不该操心）

| 硬编码的部分 | 理由 | 现有基础 |
|-------------|------|---------|
| **Session 隔离** | 子任务必须有独立 context window | ✅ CodingSessionManager + sessionMode |
| **重试 + Circuit Breaker** | API 故障重试是基础设施 | ⚠️ WorkflowConfig.retry + circuit_breaker schema 已有 |
| **事件传播** | task 状态变化的事件广播 | ⚠️ Hook 时机已定义，emit 待实现 |
| **工具执行安全** | 只读并发 vs mutation 串行 | ✅ ToolExecutor.executeSequential/Parallel |
| **Abort/Cancel 传播** | 取消信号级联 | ✅ AbortSignal 贯穿 workLoop |
| **Token 计费** | Usage tracking | ✅ AgentState.tokenUsage |
| **并发度上限** | 防止无限子任务 | ❌ 待实现 |
| **超时** | 防止单任务永久挂起 | ❌ 待实现 |

#### 不该硬编码的 — LLM 通过工具决策

| LLM 决策 | 对应的已有工具 | 理由 |
|----------|-------------|------|
| 何时创建子任务 | `task_delegate` / `task_create` | LLM 根据复杂度判断 |
| 给子任务什么 agent/提示 | `task_delegate` 的 subagent/category/prompt | LLM 构造上下文 |
| 同步 vs 后台 | `task_delegate` 的 mode | LLM 判断是否需等待 |
| Session 生命周期 | `task_delegate` 的 sessionMode | LLM 判断是否保持上下文 |
| 何时需要协助 | `agent_call` | LLM 决定找谁协作 |
| 何时需要澄清 | `clarify_request` | 子 agent 判断信息充分性 |
| Plan 的内容和结构 | `task_delegate` 的 planId + taskId | LLM 写 plan，LLM 按 plan 分发 |
| 任务复杂度分级 | 无需工具，LLM 内在能力 | LLM 自然知道何时直接做/何时 plan |
| Phase 流程 | `system-prompt.transform` hook | 流程是建议不是约束 |

### 1.3 已有编排工具详情

`packages/tools/src/orchestration/` 已有 **9 个编排工具定义**，采用回调注入模式（不依赖 orchestrator 包）：

| 工具 | 预设 | 参数 | 说明 |
|------|------|------|------|
| `task_delegate` | standard | `planId?` + `taskId?`（Plan 分发）或 `prompt` + `subagent?`/`category?`（独立分发）；`mode: 'sync'\|'background'`；`sessionId?`；`sessionMode: 'ephemeral'\|'sticky'` | 核心编排工具 |
| `agent_call` | full | `agent`, `prompt`, `mode: 'sync'\|'async'`, `sessionId?` | 调用指定 agent |
| `task_create` | full | `prompt`, `category?`, `subagent?` | 创建任务提交给 Dispatcher |
| `task_get` | full | `id` | 获取任务状态和结果 |
| `task_list` | full | `status?: 'all'\|'pending'\|'running'\|'completed'\|'error'` | 列出任务 |
| `task_update` | full | `id`, `action: 'cancel'\|'retry'` | 取消或重试任务 |
| `background_cancel` | full | `id` | 取消后台任务 |
| `background_output` | full | `id` | 获取后台任务输出 |
| `clarify_request` | full | `taskId`, `question`, `reason?` | 子 agent 向父任务请求补充说明 |

回调注入接口：

```typescript
// packages/tools/src/register-builtin.ts
interface RegisterBuiltinOptions {
  callAgent: CallAgent
  loadSkill: LoadSkill
  executeSkill: ExecuteSkill
  dispatchTask: TaskDispatch
  createTask?: CreateTask
  getTask?: GetTask
  listTasks?: ListTasks
  updateTask?: UpdateTask
  getBackgroundOutput?: GetBackgroundOutput
  cancelBackground?: CancelBackground
  clarifyRequest?: ClarifyRequest
  sessionManager?: SessionManager
}
```

---

## 二、外部框架对比矩阵

| 维度 | Superpowers | Deep Agents | Pi-mono | OpenDev | GStack | InfiAgent | Open Agent SDK |
|------|-------------|-------------|---------|---------|--------|-----------|----------------|
| **定位** | 方法论/技能框架 | Agent harness/SDK | 编码 Agent 工具链 | 终端编码 Agent | 流程技能套件 | 无限时域多级 Agent | claude-code 开源 SDK |
| **语言** | Markdown/Shell | Python (LangGraph) | TypeScript | Rust | TypeScript/Markdown | Python | TypeScript |
| **Agent 架构** | 单 Agent + 子 Agent 调度 | 单 Agent + sub-agent(task) | 单 Agent + 工具调用 | 并行 Agent Fleet | 无 Agent 层（纯 skill prompt） | 树状 Multi-Level Serial | 单 Agent + Team + Worktree |
| **规划系统** | 外置 spec→plan→execute | `write_todos` 内置 | 无 | 无 | `/autoplan` 管线 | 无（thinking module） | `EnterPlanMode/ExitPlanMode` |
| **上下文管理** | 子 Agent 隔离 | auto-summarization | 未公开 | 9-segment compact | 无 | Ten-Step 刷新文件状态 | 9-segment structured extraction |
| **工具体系** | SKILL.md 发现 | read/write/edit/bash + MCP | 同 claude-code | 内置 + MCP | slash = SKILL.md | config YAML | 26 内置 + MCP |
| **质量门禁** | spec→quality 两阶段 review | 无 | 无 | self-critique | `/review`+`/qa`+`/cso` | judge_agent (-1级) | Pre/PostToolUse hooks |
| **模型绑定** | 按复杂度选模型 | provider-agnostic | multi-provider | 5 workflow slot | 无 | per-agent 独立 | 单模型 |
| **会话恢复** | git worktree + plan file | 无 | 无 | `--continue` resume | `/checkpoint` | task_id workspace | `resume` session ID |
| **并行执行** | subagent-driven | sub-agent `task` | 无 | Agent Fleet | Conductor 10-15 | 串行 | Team + Worktree |

---

## 三、关键创新点提取

### 3.1 Superpowers — 方法纪律 (Method Discipline)

**核心洞察：** Agent 不是工具集合，是方法论的运行时。

- **HARD-GATE 机制**：brainstorm 完成前禁止实现，plan 完成前禁止执行。phase transition 由 SKILL.md 强制。
- **子 Agent 两阶段 Review**：每个 task 完成后先 spec compliance review，再 code quality review，循环直到通过。
- **Controller-Implementer 分离**：controller（lead）提取 task 全文构造精确上下文传给 subagent。
- **模型分层选择**：机械任务→cheap model，集成→standard，架构/设计/review→most capable。
- **状态协议**：`DONE | DONE_WITH_CONCERNS | NEEDS_CONTEXT | BLOCKED`

**vitamin 吸收：** Phase 引导（Prompt 层非强制） / 两阶段 review（agent_call） / 按 slot 选模型（配置驱动映射）

### 3.2 Deep Agents — Harness 模式

**核心洞察：** 提供开箱即用的 Agent + 可覆盖层。

- **write_todos** 作为核心规划工具（轻量级、内联 plan）
- **sub-agent 通过 `task` 工具派生**，隔离上下文窗口

**vitamin 吸收：** write_todos → 轻量 plan 工具（中等复杂度） / sub-agent 隔离 → ephemeral session

### 3.3 InfiAgent/MLA — 无限时域执行

**核心洞察：** 文件系统是状态的真实来源，不是对话历史。

- **Ten-Step Strategy**：每 30 步 thinking module 更新文件空间状态描述，只保留最近 10 步
- **树状层级**：Level 3→2→1→0→-1
- **per-agent 模型独立**：execution_model / thinking_model / compressor_model

**vitamin 吸收：** File-State-as-Truth → capture_file_state 工具 / 层级隔离 → subagent context 注入 / per-workflow-slot 模型绑定

### 3.4 OpenDev — Compound AI System

**核心洞察：** 不同工作流绑定不同模型是架构选择。

- **5 Workflow Slots**：Normal/Thinking/Compact/Critique/VLM
- **Agent Fleet**：并行子 Agent，独立 LLM binding + context window
- **per-turn system prompt composition with section caching**

**vitamin 吸收：** WorkflowSlot → ModelSlotResolver / Section Caching / Agent Fleet → FleetExecutor（Phase 2）

### 3.5 GStack — Sprint 流程即产品

**核心洞察：** 把软件工程流程编码为有序的 skill 管线。

- **Think → Plan → Build → Review → Test → Ship → Reflect**
- **Autoplan**：自动串联 CEO→Design→Eng review，只在 taste decision 暂停
- **Operational Learning**：`/learn` 管理 pattern/pitfall/preference 记忆

**vitamin 吸收：** Autoplan Pattern → Prompt 引导 plan→review / Operational Learning → learn 工具 + LearningStore

### 3.6 Open Agent SDK — In-Process Engine

**核心洞察：** 完整的 claude-code 引擎以 SDK 形式提供。

- **4-layer permission pipeline**：rules → low-risk skip → whitelist → AI classifier
- **工具并发策略**：read-only 并发，mutation 串行
- **autoDream 后台记忆整理**

**vitamin 吸收：** 工具并发 → readonly 标记 + batch-then-serial / autoDream → session 结束时 LLM 总结经验

---

## 四、整体架构

### 4.1 架构图

```
┌──────────────────────────────────────────────────────┐
│                    LLM (大模型)                       │
│  "我是编排者。我通过调用工具来管理任务、代理和审查"      │
└──────────────────────┬───────────────────────────────┘
                       │ tool calls
                       ▼
┌──────────────────────────────────────────────────────┐
│     @vitamin/tools — orchestration/ (✅ 已实现)       │
│                                                      │
│  task_delegate ─┐  (standard 预设)                   │
│                 │                                    │
│  agent_call    ─┤  task_create ──┐  (full 预设)      │
│  task_get      ─┤  task_list   ──┤                   │
│  task_update   ─┤  clarify_req ──┤                   │
│  bg_output     ─┤  bg_cancel   ──┘                   │
│  skill_load    ─┤  skill_exec  ──┘                   │
│  session_mgr   ─┘                                    │
│                                                      │
│  每个工具通过 RegisterBuiltinOptions 回调              │
│  调用 Orchestrator 提供的实现                         │
└──────────────────────┬───────────────────────────────┘
                       │ callback invocations
                       ▼
┌──────────────────────────────────────────────────────┐
│     Orchestrator 内核 — packages/orchestrator/src     │
│     ★ 待实现：实现 RegisterBuiltinOptions 回调        │
│                                                      │
│  ┌───────────────┐  ┌──────────────────────────────┐ │
│  │ TaskStore     │  │ HookRegistry emit            │ │
│  │ (状态存储)     │  │ task.created/started/...     │ │
│  └───────┬───────┘  │ review.requested/passed/...  │ │
│          │          └──────────┬───────────────────┘ │
│  ┌───────┴─────────────────────┴───────┐             │
│  │        Executor (执行器)             │             │
│  │  · CodingSessionManager 创建/复用    │             │
│  │  · agent.run() + workLoop            │             │
│  │  · 标准化输出 (TaskDispatchResult)    │             │
│  │  · retry + circuit breaker           │             │
│  │  · abort/timeout                     │             │
│  └──────────────────────────────────────┘             │
│                                                      │
│  ┌──────────────────────────────────────┐            │
│  │ FleetExecutor (并行执行，Phase 2)     │           │
│  │  · fan-out/fan-in + race             │           │
│  │  · 并发度限制 + 超时                   │           │
│  └──────────────────────────────────────┘            │
└──────────────────────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────┐
│          已有基础设施层                                │
│                                                      │
│  @vitamin/agent    workLoop + ToolExecutor       (✅) │
│  @vitamin/session  Session + CodingSessionManager(✅) │
│  @vitamin/hooks    31 timings + 9 编排 hooks     (✅) │
│  @vitamin/setting  WorkflowConfig + AgentConfig  (✅) │
│  @vitamin/shared   TypedEventEmitter             (✅) │
│  @vitamin/ai       stream + ModelRegistry        (✅) │
└──────────────────────────────────────────────────────┘
```

### 4.2 四层职责划分

```
┌─────────────────────────────────────────────────────────────────┐
│                     代码层（Runtime）                            │
│  只做：                                                         │
│  · 类型安全（Task / WorkflowSlot / FleetSpec）                  │
│  · 并发安全（read-only 并发 / mutation 串行 / fleet 窗口）      │
│  · 持久化（checkpoint / session / lesson 存储）                 │
│  · hook 拦截（31 timing + 编排 9 events）                       │
│  · slot→model 映射（配置驱动查表，非规则驱动）                   │
│  · 工具元数据（readonly 标记是工具固有属性，非上下文决策）        │
├─────────────────────────────────────────────────────────────────┤
│                   配置层（Settings / AgentSpec）                 │
│  可调：                                                         │
│  · 默认模型、slot→model 映射表                                  │
│  · 工具预设（minimal/standard/full）                            │
│  · review 策略（是否启用、失败后 retry/cancel/escalate）        │
│  · retry 策略（max_attempts、backoff）                         │
│  · circuit breaker 阈值                                        │
├─────────────────────────────────────────────────────────────────┤
│                  Prompt 层（System Prompt + Hook 注入）          │
│  引导：                                                         │
│  · 阶段纪律（"当前阶段：Plan — 在此阶段应聚焦于..."）          │
│  · 复杂度评估指引（"单文件→直接执行，跨模块→制定计划"）        │
│  · Review 时机建议（"完成实现后，考虑请求 spec review"）        │
│  · 经验注入（相关历史 lessons）                                 │
│  · 文件状态摘要（最近修改的文件及其变更）                       │
├─────────────────────────────────────────────────────────────────┤
│                   大模型层（LLM Runtime Decisions）              │
│  决策：                                                         │
│  · 当前处于哪个阶段，何时转换                                   │
│  · 任务复杂度分类，选择执行路径                                 │
│  · 是否需要 review，何时请求                                    │
│  · dispatch 时指定 workflowSlot / sessionPolicy / mode          │
│  · 何时捕获文件状态快照                                         │
│  · 提取和记录经验                                               │
│  · 选择调用哪些工具、传什么参数                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 五、类型系统

> 在 `packages/orchestrator/src/types.ts` 中实现。设计原则：与 @vitamin/tools 已定义的回调接口对齐。

### 5.1 Task — 纯状态记录

```typescript
interface Task {
  id: string
  parentId?: string
  status: TaskStatus
  sessionPolicy: 'ephemeral' | 'sticky'
  sessionId?: string
  attempts: number
  maxAttempts: number
  input: TaskInput
  output?: TaskOutput
  error?: TaskError
  createdAt: number
  completedAt?: number
}

type TaskStatus =
  | 'pending'      // 已创建，等待执行
  | 'running'      // 正在执行中
  | 'completed'    // 成功完成
  | 'failed'       // 执行失败（task_list 中显示为 'error'）
  | 'cancelled'    // 已取消

/**
 * TaskInput — 对齐 @vitamin/tools 中已定义的回调参数
 * 来源：task_delegate / task_create / agent_call
 */
interface TaskInput {
  prompt: string
  subagent?: string
  category?: string
  planId?: string
  taskId?: string
  sessionId?: string
  sessionMode?: 'ephemeral' | 'sticky'
  mode?: 'sync' | 'background'
}

/** 对齐 TaskDispatchResult */
interface TaskOutput {
  text: string
  summary?: string
  tokenUsage?: { input: number; output: number; cacheRead: number }
  durationMs?: number
}

interface TaskError {
  code: string
  message: string
  retriable: boolean
}
```

### 5.2 TaskStore — 纯状态存储

```typescript
interface TaskStore {
  create(input: TaskInput): Promise<Task>
  get(id: string): Promise<Task | undefined>
  list(filter?: { status?: TaskStatus; parentId?: string }): Promise<Task[]>
  update(id: string, patch: Partial<Task>): Promise<void>
  delete(id: string): Promise<boolean>
}
```

### 5.3 Orchestrator Facade — 实现 RegisterBuiltinOptions 回调

```typescript
/**
 * Orchestrator 不定义自己的 ToolCallbacks。
 * 它的公共 API = RegisterBuiltinOptions 中各回调的实现。
 *
 * 集成方式：
 *   const orchestrator = createOrchestrator({ ... })
 *   registerBuiltinTools(registry, projectRoot, {
 *     dispatchTask: orchestrator.dispatchTask,
 *     callAgent:    orchestrator.callAgent,
 *     createTask:   orchestrator.createTask,
 *     ...
 *   })
 */
interface Orchestrator {
  dispatchTask: import('@vitamin/tools').TaskDispatch
  callAgent: import('@vitamin/tools').CallAgent
  createTask: import('@vitamin/tools').CreateTask
  getTask: import('@vitamin/tools').GetTask
  listTasks: import('@vitamin/tools').ListTasks
  updateTask: import('@vitamin/tools').UpdateTask
  getBackgroundOutput: import('@vitamin/tools').GetBackgroundOutput
  cancelBackground: import('@vitamin/tools').CancelBackground
  clarifyRequest: import('@vitamin/tools').ClarifyRequest
  readonly taskStore: TaskStore
  readonly hookRegistry: import('@vitamin/hooks').HookRegistry
  dispose(): void
}
```

### 5.4 Fleet — 并行执行基础设施（Phase 2）

```typescript
type FleetStrategy = 'fan_out_fan_in' | 'race'

interface FleetSpec {
  id: string
  strategy: FleetStrategy
  members: FleetMember[]
  maxConcurrency?: number
  timeoutMs?: number
}

interface FleetMember {
  label: string
  input: TaskInput
}

interface FleetResult {
  fleetId: string
  strategy: FleetStrategy
  memberResults: Map<string, TaskOutput | TaskError>
  aggregated?: TaskOutput
  durationMs: number
}
```

### 5.5 事件模型 — 复用 @vitamin/hooks

Orchestrator 通过 `HookRegistry.emit()` 发射编排事件，复用已定义的 9 种编排 hook 时机：

```
task.created | task.started | task.completed | task.failed | task.cancelled | task.recovered
review.requested | review.passed | review.failed
```

不单独定义 OrchestratorEventBus。

### 5.6 Agent 配置 — 复用 @vitamin/setting

Agent 配置直接使用 `AgentConfigSchema`（model / description / system_prompt / tools / capabilities / max_tool_turns），Category 配置使用 `CategoriesConfigSchema`。Orchestrator 通过 SettingsManager 读取配置，在执行 task_delegate 时根据 subagent/category 参数查找对应配置。不单独定义 AgentRegistry。

---

## 六、回调实现设计

### 6.1 已有工具 → 需实现的回调

| 已有工具 (tools/src/) | Orchestrator 回调 | 说明 |
|----------------------|------------------|------|
| `task_delegate` (standard) | TaskDispatch | Plan 模式: planId+taskId / 独立模式: subagent/category |
| `agent_call` (full) | CallAgent | 调用指定 agent（探索/review 等） |
| `task_create` (full) | CreateTask | 创建 pending Task → TaskStore → emit task.created |
| `task_get` (full) | GetTask | 从 TaskStore 查询 |
| `task_list` (full) | ListTasks | 按 status 过滤（'error' → 'failed' 映射） |
| `task_update` (full) | UpdateTask | cancel → emit task.cancelled / retry → 重新执行 |
| `background_output` (full) | GetBackgroundOutput | 查询后台任务当前输出 |
| `background_cancel` (full) | CancelBackground | 取消 + 级联 abort |
| `clarify_request` (full) | ClarifyRequest | 向父任务注入 steering / 升级到 lead/user |

### 6.2 核心回调：dispatchTask

```typescript
// packages/orchestrator/src/executor.ts
async function dispatchTask(args: TaskDispatchArgs): Promise<TaskDispatchResult> {
  // 1. 解析 agent 配置（从 @vitamin/setting）
  const agentConfig = args.subagent
    ? settingsManager.get(`agents.${args.subagent}`)
    : args.category
      ? settingsManager.get(`categories.${args.category}`)
      : undefined

  // 2. 创建 Task
  const task = await taskStore.create({ ...args })
  await hookRegistry.emit('task.created', { taskId: task.id })

  // 3. 创建/复用 session
  const session = args.sessionMode === 'sticky' && args.sessionId
    ? codingSessionManager.getSession(args.sessionId)
    : await codingSessionManager.createSession({
        model: agentConfig?.model ?? defaultModel,
        systemPrompt: agentConfig?.system_prompt ?? defaultPrompt,
        tools: resolveTools(agentConfig?.tools),
        maxToolTurns: agentConfig?.max_tool_turns ?? 25,
      })

  // 4. 执行
  await hookRegistry.emit('task.started', { taskId: task.id })
  try {
    const result = await session.prompt(args.prompt)
    await taskStore.update(task.id, { status: 'completed', output: result })
    await hookRegistry.emit('task.completed', { taskId: task.id })
    return { success: true, output: result.text, id: task.id, status: 'completed' }
  } catch (error) {
    // 5. 重试（如果 WorkflowConfig.retry.enabled）
    if (isRetriable(error) && task.attempts < maxAttempts) {
      return retryTask(task, args)
    }
    await taskStore.update(task.id, { status: 'failed', error })
    await hookRegistry.emit('task.failed', { taskId: task.id })
    return { success: false, error: error.message }
  }
}
```

### 6.3 对 LLM 透明的基础设施

```typescript
// 重试 — 配置来自 WorkflowConfig.retry
interface RetryPolicy {
  enabled: boolean
  maxAttempts: number
  backoffMs: number
  backoffMultiplier: number
}

// Circuit Breaker — 配置来自 WorkflowConfig.circuit_breaker
interface CircuitBreakerConfig {
  enabled: boolean
  failureThreshold: number
  resetTimeoutMs: number
}

// 并发度限制
interface ConcurrencyLimits {
  maxActiveTasks: number
  maxBackgroundTasks: number
}

// Session 编排 — 复用 CodingSessionManager
//   ephemeral: createSession() → prompt() → dispose()
//   sticky:    createSession() → 保存 sessionId → 后续 getSession() 复用
```

---

## 七、Lead Agent 能力模块

### 7.1 Phase Context Injection（阶段上下文注入）

Phase 作为上下文标注注入 system prompt，LLM 自我调节（非运行时工具封锁）。

**1) Phase Context Annotation（代码层 — 仅注入状态）**

```typescript
// 通过 system-prompt.transform hook 注入
interface PhaseAnnotation {
  currentPhase: string     // LLM 上一次声明的 phase（从 session metadata 读取）
  phaseHistory: string[]
  tasksSummary?: string
}

function injectPhaseContext(systemPrompt: string, annotation: PhaseAnnotation): string {
  return systemPrompt + `\n\n[Phase Context]\nCurrent: ${annotation.currentPhase}\nHistory: ${annotation.phaseHistory.join(' → ')}`
}
```

**2) Phase Guidance（Prompt 层）**

```markdown
### Phase Discipline
你在执行任务时应遵循以下阶段模型：
**Clarify** → **Plan** → **Execute** → **Verify** → **Conclude**
- **Clarify**: 理解需求，阅读相关代码，提出澄清问题。不要在此阶段修改文件。
- **Plan**: 制定方案（简单任务可内联规划，复杂任务使用 plan 工具）。
- **Execute**: 实施变更，按计划逐步执行。
- **Verify**: 自查变更是否正确，运行相关测试。
- **Conclude**: 总结完成的工作和遗留事项。
简单请求可折叠阶段。当你进入新阶段时，在回复中声明：`[Phase: Execute]`
```

**3) Phase Monitor（可选 — 软监控，不阻止执行）**

```typescript
function phaseMonitorHook(toolName: string, phaseAnnotation: PhaseAnnotation) {
  if (phaseAnnotation.currentPhase === 'clarify' && isMutationTool(toolName)) {
    logger.warn(`Tool ${toolName} called during clarify phase`)
  }
}
```

**实现路径：**
1. `system-prompt.transform` hook 注入 phase annotation（从 session metadata 读取）
2. Lead prompt 中加入 Phase Discipline 引导文本
3. LLM 回复中 `[Phase: X]` 通过 `chat.message.after` hook 提取存入 session metadata
4. 可选：devtools 面板显示当前 phase（只读监控）

### 7.2 Compound Model Binding（复合模型绑定）

WorkflowSlot 类型 + 配置驱动 slot→model 映射。LLM 在 dispatch 时可指定 slot。

```typescript
// packages/ai/src/model-slots.ts
type WorkflowSlot = 'normal' | 'thinking' | 'compact' | 'critique' | 'vision'

interface ModelSlotConfig {
  slots: Partial<Record<WorkflowSlot, ModelSpec | ModelSpec[]>>
  default: ModelSpec
}

class ModelSlotResolver {
  resolve(slot: WorkflowSlot): Model {
    return this.config.slots[slot] ?? this.config.default  // 纯查表，无决策逻辑
  }
}
```

**WorkflowSlot 选择优先级：**
1. LLM 在 tool 参数中显式指定
2. AgentConfig.defaultWorkflowSlot（配置层）
3. ModelSlotConfig.default（全局默认）

**Prompt 引导 LLM 选择 slot：**
```markdown
当 dispatch 子任务时，你可以指定 workflowSlot：
- normal: 常规执行  - thinking: 深度推理  - compact: 压缩摘要
- critique: 代码审查  - vision: 图像理解
```

**实现路径：**
1. `ModelSlotConfig` 加入 `VitaminSetting` schema，对接 web-ui 已有的 `ModelSlot.tsx`
2. `ModelSlotResolver` 在 `@vitamin/ai` 中实现
3. Orchestrator 创建 session 时将 slot 传递给 resolver

### 7.3 Review as Capability（Review 作为能力）

LLM 通过已有 `agent_call` / `task_delegate` 工具发起 review，非自动管线。

**1) Reviewer Agent 注册（配置层）**

```typescript
// 通过 @vitamin/setting agents 配置注册
const specReviewer = {
  name: 'spec-reviewer',
  description: 'Reviews implementation against specification requirements',
  categories: ['review'],
  defaultWorkflowSlot: 'critique',
}

const qualityReviewer = {
  name: 'quality-reviewer',
  description: 'Reviews code quality, patterns, and best practices',
  categories: ['review'],
  defaultWorkflowSlot: 'critique',
}
```

**2) Review Guidance（Prompt 层）**

```markdown
### Review Guidance
完成子任务实现后，根据复杂度决定是否发起 review：
- 对 **关键架构变更** 或 **跨模块修改**，建议发起 spec review
- 对 **代码质量敏感** 的变更，可追加 quality review
- 对 **简单修改**（typo、单行修复），无需 review
Review 不通过时，将反馈传回实现者重新修复，然后再次请求 review。
这个循环由你（lead agent）驱动。
```

**实现路径：**
1. 注册 spec-reviewer / quality-reviewer Agent 配置
2. Lead prompt 中加入 Review Guidance 引导文本
3. 已有 `agent_call` / `task_delegate` 即可发起 review（无需新工具）

### 7.4 File-State Snapshot（文件状态快照）

快照作为工具能力暴露，不硬编码触发条件。

```typescript
// packages/memory/src/file-state-snapshot.ts
interface FileStateSnapshot {
  timestamp: number
  directoryTree: string
  modifiedFiles: Array<{
    path: string
    action: 'created' | 'modified' | 'deleted'
    summary: string
  }>
  planStatus?: string
  findings: string[]
}

interface FileStateManager {
  capture(workspaceDir: string, recentMessages: AgentMessage[]): Promise<FileStateSnapshot>
  injectSnapshot(messages: AgentMessage[], snapshot: FileStateSnapshot): AgentMessage[]
}
```

**触发方式：**

| 触发者 | 方式 |
|--------|------|
| LLM 主动 | 调用 `capture_file_state` 工具 |
| compaction hook | `compaction.before` 检查是否需要 snapshot |
| checkpoint | save() 附带快照 |

**Prompt 引导：**
```markdown
当你感知到对话已经很长、上下文可能遗漏了之前的文件变更时，
可以调用 `capture_file_state` 工具刷新工作空间状态。
```

**实现路径：**
1. `FileStateManager` 在 `@vitamin/memory` 中实现
2. 注册 `capture_file_state` 工具
3. `compaction.before` hook 中可选嵌入 snapshot
4. Snapshot 使用 compact slot 模型生成

### 7.5 Progressive Complexity Routing（渐进复杂度路由）

复杂度路由完全由 LLM 决策，通过选择不同工具路径表达。

| LLM 判断 | LLM 行为 | 使用的已有工具 |
|----------|---------|---------------|
| 简单（单文件查询/编辑） | 直接调用 read/write/edit/bash | minimal 工具集 |
| 中等（几个文件，明确范围） | 内联规划后执行 | write\_todos + 内置工具 |
| 复杂（跨模块，需设计） | 创建 plan → dispatch 子任务 → review | task\_delegate + agent\_call |

**Prompt 引导：**
```markdown
### Complexity Routing
- **Direct**（单文件、无歧义）：直接使用工具完成
- **Lightweight**（2-3 文件、范围清晰）：内联规划后执行
- **Full Pipeline**（跨模块、需设计）：制定计划，委派子任务，请求 review
根据评估选择合适的工具路径即可，无需显式声明 tier。
```

### 7.6 Read-Only Tool Concurrency（只读工具并发）

read-only 工具并发，mutation 工具串行。

```typescript
// work-loop.ts 变更
async function executeToolCalls(toolCalls, tools, policy) {
  const readOnly = toolCalls.filter(tc => policy.isReadOnly(findTool(tc, tools)))
  const mutations = toolCalls.filter(tc => !policy.isReadOnly(findTool(tc, tools)))

  // read-only 并发
  const readResults = await Promise.all(readOnly.map(tc => executeSingleTool(tc)))
  // mutation 串行（read-only 完成后）
  const mutationResults = []
  for (const tc of mutations) {
    mutationResults.push(await executeSingleTool(tc))
  }
  return [...readResults, ...mutationResults]
}
```

只读工具：`read_file`, `grep`, `glob`, `ls`, `find`, `lsp.definition`, `lsp.references`, `lsp.symbols`, `task_get`, `task_list`

**实现路径：**
1. `AgentTool` 接口新增 `readonly?: boolean`
2. `work-loop.ts` tool execution 改为 batch-then-serial
3. `ToolRegistry.register()` 对内置工具标记 readonly

### 7.7 Operational Learning（运行学习）

经验提取由 LLM 驱动，存储层只负责持久化和搜索。

```typescript
// packages/memory/src/operational-learning.ts
interface Lesson {
  id: string
  tags: string[]         // LLM 自由生成（不限定固定类型）
  trigger: string
  insight: string
  sourceSessionId: string
  createdAt: number
  appliedCount: number
}

interface OperationalLearningStore {
  save(lesson: Omit<Lesson, 'id' | 'createdAt' | 'appliedCount'>): Promise<Lesson>
  search(query: string, limit?: number): Promise<Lesson[]>
  list(filter?: { tags?: string[]; query?: string }): Promise<Lesson[]>
  delete(id: string): Promise<void>
}
```

**触发方式：**

| 方式 | 触发者 |
|------|--------|
| `learn` 工具 | LLM 主动调用 |
| Session 结束 prompt | `session.idle` hook |
| Steering 注入 | 用户手动 |

**注入机制：** `system-prompt.transform` hook 中 `LearningStore.search()` → 注入 top-K lessons。

**实现路径：**
1. `OperationalLearningStore` 在 `@vitamin/memory` 中实现
2. 注册 `learn` 工具
3. `system-prompt.transform` hook 注入相关 lessons
4. `session.idle` hook 可选触发经验提取 prompt

---

## 八、System Prompt 引导模板

以下通过 `system-prompt.transform` hook 注入 lead agent system prompt，替代运行时流程约束：

```markdown
### 工作流程引导

你是 lead agent，通过工具管理任务的创建、执行和质量保证。

#### 简单任务（单文件编辑、快速查询）
直接使用工具完成，不需要 plan 或 delegate。

#### 中等任务（2-3 文件修改）
1. 在回复中简要列出步骤
2. 用 task_delegate 逐步执行（指定 subagent 或 category）
3. 执行后自行检查结果

#### 复杂任务（多文件、需要设计决策）
1. 先用 clarify_request 确认需求
2. 创建 plan（写入文件或记录在回复中）
3. 用 task_delegate(planId, taskId) 按计划逐步执行
4. 关键步骤完成后用 agent_call 请 reviewer agent review
5. 确认所有任务完成后总结

#### 何时使用 review（通过 agent_call）
- 涉及安全、API 设计、数据模型等关键决策时
- 跨模块修改时
- 不确定实现是否正确时
- **不需要**：纯机械操作（重命名、格式化）、简单 bug 修复

#### 后台任务管理
- 大型搜索/分析可用 task_delegate(mode: 'background') 后台执行
- 用 background_output 检查进度
- 用 background_cancel 取消不再需要的任务
```

---

## 九、实现阶段规划

### Phase 0 — orchestrator 包重建（前置条件）

| 编号 | 任务 | 包 | 说明 |
|------|------|-----|------|
| 0.1 | 修复 orchestrator package.json | `@vitamin/orchestrator` | 移除不存在的 @vitamin/dispatcher 和 @vitamin/plan 依赖；添加 @vitamin/agent, @vitamin/hooks, @vitamin/setting, @vitamin/shared, @vitamin/ai |
| 0.2 | 创建最小类型系统 | `@vitamin/orchestrator` | src/types.ts + src/index.ts |
| 0.3 | 创建 TaskStore | `@vitamin/orchestrator` | src/task-store.ts (Map-based 内存存储) |
| 0.4 | 修复 tools 编译错误 | `@vitamin/tools` | 移除 index.ts 中不存在的 plan-create/get/list/update 导出 |

**目标：** `pnpm build` 通过，类型导出可用。

### Phase 1 — 回调实现（task_delegate 可用）

| 编号 | 任务 | 包 | 说明 |
|------|------|-----|------|
| 1.1 | Executor — TaskDispatch + CallAgent 回调 | `@vitamin/orchestrator` | src/executor.ts |
| 1.2 | RetryPolicy + CircuitBreaker | `@vitamin/orchestrator` | src/retry.ts |
| 1.3 | BackgroundManager | `@vitamin/orchestrator` | src/background-manager.ts |
| 1.4 | OrchestratorFacade + Factory | `@vitamin/orchestrator` | src/orchestrator.ts + src/factory.ts |
| 1.5 | VitaminApp 接入 | `@vitamin/coding` | 注入真实回调，移除 stub + orchestration 工具移除逻辑 |

**目标：** LLM 可通过 `task_delegate` 创建子任务、`task_get/list` 查状态、`agent_call` 协作。

### Phase A — 基础增强

| 编号 | 任务 | 包 | 性质 |
|------|------|-----|------|
| A1 | Read-Only Tool Concurrency | `@vitamin/agent` | 代码层（并发安全） |
| A2 | AgentTool.readonly 标记 | `@vitamin/tools` | 代码层（工具属性） |
| A3 | System Prompt Section Caching | `@vitamin/coding` | 代码层（性能） |

### Phase B — Prompt 层引导 + 工具能力

| 编号 | 任务 | 包 | 性质 |
|------|------|-----|------|
| B1 | Phase Context Injection hook | `@vitamin/coding` | Prompt 层 |
| B2 | Complexity Routing 引导文本 | `@vitamin/coding` | Prompt 层 |
| B3 | Review Guidance 引导文本 | `@vitamin/coding` | Prompt 层 |
| B4 | Reviewer AgentSpec 配置 | `@vitamin/setting` | 配置层 |
| B5 | Lightweight Plan 工具 (write\_todos) | `@vitamin/tools` | 工具能力 |

### Phase C — 模型绑定 + 状态能力

| 编号 | 任务 | 包 | 性质 |
|------|------|-----|------|
| C1 | ModelSlotResolver 后端 | `@vitamin/ai` | 代码层（配置驱动查表） |
| C2 | ModelSlotConfig 加入 Setting | `@vitamin/setting` | 配置层 |
| C3 | capture\_file\_state 工具 | `@vitamin/memory` + `@vitamin/tools` | 工具能力 |
| C4 | File State Prompt 引导 | `@vitamin/coding` | Prompt 层 |

### Phase D — 经验学习

| 编号 | 任务 | 包 | 性质 |
|------|------|-----|------|
| D1 | OperationalLearningStore | `@vitamin/memory` | 代码层（持久化） |
| D2 | learn 工具注册 | `@vitamin/tools` | 工具能力 |
| D3 | Lesson Injection hook | `@vitamin/coding` | Prompt 层 |
| D4 | Session-end learning prompt | `@vitamin/coding` | Prompt 层 |

### Phase 2 — Fleet 并行（可选）

| 编号 | 任务 | 包 | 说明 |
|------|------|-----|------|
| 2.1 | 新增 run_fleet 工具定义 | `@vitamin/tools` | LLM 可调用的并行执行工具 |
| 2.2 | RegisterBuiltinOptions 新增 runFleet | `@vitamin/tools` | 回调接口扩展 |
| 2.3 | FleetExecutor | `@vitamin/orchestrator` | fan_out_fan_in + race 策略 |

### Phase 3 — Checkpoint（可选）

| 编号 | 任务 | 包 | 说明 |
|------|------|-----|------|
| 3.1 | 新增 save/restore_checkpoint 工具 | `@vitamin/tools` | LLM 可保存/恢复长任务状态 |
| 3.2 | CheckpointStore | `@vitamin/orchestrator` | 基于 @vitamin/persistence 的快照存储 |

---

## 十、实现文件清单

### 已存在（不需新建）

```
@vitamin/tools/src/orchestration/        ✅ 9 个工具定义 + 回调类型导出
@vitamin/tools/src/register-builtin.ts   ✅ RegisterBuiltinOptions 回调注入
@vitamin/hooks/src/types.ts              ✅ 9 种编排 hook 时机定义
@vitamin/setting/src/schema/workflow.ts  ✅ WorkflowConfig (retry/circuit_breaker/review/routing)
@vitamin/setting/src/schema/agents.ts    ✅ AgentConfig per-agent 配置
@vitamin/setting/src/schema/categories.ts ✅ CategoryConfig per-category 配置
@vitamin/coding/src/session/             ✅ CodingSessionManager
@vitamin/agent/src/                      ✅ Agent + workLoop + ToolExecutor
@vitamin/shared/src/event-emitter.ts     ✅ TypedEventEmitter
```

### 需要创建（packages/orchestrator/src/）

```
types.ts              — Task, TaskInput, TaskOutput, TaskError, TaskStatus, FleetSpec
task-store.ts         — 进程内 Map-based Task 存储
executor.ts           — 实现 TaskDispatch + CallAgent 回调
retry.ts              — RetryPolicy + CircuitBreaker（读取 WorkflowConfig）
background-manager.ts — 后台任务管理：GetBackgroundOutput + CancelBackground
clarify-handler.ts    — ClarifyRequest 回调（steering 注入/升级）
orchestrator.ts       — OrchestratorFacade：组装所有回调
factory.ts            — createOrchestrator() 工厂函数
index.ts              — 公共导出
```

### 需要修改

```
@vitamin/coding/src/app/vitamin-app.ts
  当前：stub 回调 + 移除 orchestration 类别
  目标：注入 orchestrator 真实回调，保留 orchestration 工具

packages/orchestrator/package.json
  移除不存在的 @vitamin/dispatcher 和 @vitamin/plan
  添加：@vitamin/agent, @vitamin/hooks, @vitamin/setting, @vitamin/shared, @vitamin/ai
```

### 后续按需添加

```
fleet-executor.ts     — Phase 2（当前无对应工具）
checkpoint-store.ts   — Phase 3（当前无对应工具）
```

---

## 十一、变更影响分析

### 对现有 package 的变更

```
@vitamin/orchestrator                                         ★ 从零实现
  └── 类型系统 + TaskStore + Executor + Retry + BackgroundManager + Facade

@vitamin/agent
  └── work-loop.ts: batch-then-serial                        [A1] 代码层
  └── types.ts: AgentTool.readonly                           [A2] 代码层

@vitamin/ai
  └── 新增 model-slots.ts: ModelSlotResolver                 [C1] 代码层

@vitamin/tools
  └── 内置工具标记 readonly                                   [A2] 代码层
  └── 新增 write_todos 轻量 plan 工具                         [B5] 工具能力
  └── 新增 learn 经验记录工具                                 [D2] 工具能力
  └── 新增 capture_file_state 快照工具                        [C3] 工具能力

@vitamin/coding
  └── vitamin-app.ts 接入 orchestrator 回调                  [1.5] 代码层
  └── system-prompt.transform hook: phase/complexity/review/lesson/filestate  [B1-B3,C4,D3]
  └── prompt section caching                                 [A3] 代码层

@vitamin/memory
  └── 新增 file-state-snapshot.ts                            [C3] 代码层
  └── 新增 operational-learning.ts                           [D1] 代码层

@vitamin/setting
  └── modelSlots 配置                                        [C2] 配置层
  └── reviewer agent 配置                                    [B4] 配置层
```

### 变更分层统计

| 层 | 数量 | 内容 |
|----|------|------|
| **代码层** | 6 | readonly 并发、slot resolver、section caching、FileState/Learning store、orchestrator 回调 |
| **工具能力** | 3 | write\_todos、learn、capture\_file\_state |
| **配置层** | 3 | ModelSlotConfig、reviewer AgentSpec、Setting schema |
| **Prompt 层** | 5 | phase/complexity/review/lesson/filestate 引导注入 |

### 不变的核心抽象

- `Agent` class & `workLoop()` 核心循环（只改并发策略）
- `HookRegistry` API（新功能通过注册 hook 实现，31 时机不变）
- `Session` 接口（DAG branching 不变）
- `ProviderRegistry` / `StreamFunction`（slot resolver 在上层组合）

---

## 十二、与七大框架的对齐总结

| 框架 | 吸收的核心机制 | vitamin 实现方式 | 实现层 |
|------|--------------|-----------------|--------|
| **Superpowers** | Phase discipline + Two-stage review + Model selection | Phase annotation hook + agent_call review + ModelSlotResolver | Prompt + 工具 + 配置 |
| **Deep Agents** | write_todos + Sub-agent isolation | 轻量 plan 工具 + ephemeral session | 工具 + 配置 |
| **InfiAgent** | File-State-as-Truth + Per-workflow model | capture_file_state 工具 + WorkflowSlot | 工具 + Prompt |
| **OpenDev** | 5 Workflow Slots + Agent Fleet + Section caching | LLM dispatch 时指定 slot + FleetExecutor + section cache | 大模型 + 代码 |
| **GStack** | Autoplan + Review Readiness + /learn | Prompt 引导 + learn 工具 | Prompt + 工具 |
| **Open Agent SDK** | Read-only concurrency + autoDream | readonly 标记 + batch-then-serial + session-end learning | 代码 |
| **Pi-mono** | TypeScript monorepo + Agent core | vitamin 现有架构已对齐 | ✅ |

### 与各框架的关键差异

| 维度 | 参考框架 | vitamin |
|------|---------|--------|
| Phase 执行 | SKILL.md 文本指引 | 同思路：Prompt 引导，不做代码守卫 |
| Complexity routing | LLM 自然选择工具 | 同思路：Prompt 描述路径，LLM 选择 |
| Review trigger | Controller LLM 决定 | 同思路：LLM 调用 agent_call |
| Model selection | Agent config 绑定 slot | 延伸：LLM 也可在 dispatch 时指定 slot |
| Learning | /learn slash command | 延伸：learn 工具 + session 结束提取 |
| Sub-agent delegation | Parent LLM 决定 | 同思路：LLM 调用 task_delegate |
| 调度器 | 无独立调度器 | 同思路：LLM 就是调度器 |
| Plan 执行 | LLM 自己按 plan 执行 | 同思路：task_delegate(planId, taskId) |

### 与七大框架的精准对齐

**学 Deep Agents：** `task` 工具就是全部。LLM 决定何时调用、调什么、给什么 prompt。vitamin 对齐：`task_delegate` 就是 vitamin 的 `task` tool。

**学 Pi-Mono：** 最小内核 + 工具扩展。4 个核心工具，高级能力通过 Extension。vitamin 对齐：minimal 预设 = 4 工具，编排工具在 standard/full 预设按需引入。

**学 Open Agent SDK：** LLM 驱动任务创建。`TaskCreate` / `TaskUpdate` 让 LLM 管理任务生命周期。vitamin 对齐：`task_create` + `task_get` + `task_list` + `task_update` 完全对齐。

**学 gstack：** Phase 是 Prompt 引导。`Think → Plan → Build → Review → Test → Ship` 是 markdown skill 文字指引。vitamin 对齐：Phase 引导通过 `system-prompt.transform` hook 注入。

**学 Superpowers：** Plan 是 LLM 写的文档 + agent_call 做 Review。vitamin 对齐：`task_delegate` 的 `planId + taskId` 模式 + `agent_call` 调 reviewer agent。

**学 InfiAgent：** 子 agent 可请求澄清。vitamin 对齐：`clarify_request` 工具已定义。

---

> **一句话总结：** Orchestrator 不是编排者——**LLM 才是编排者**。Orchestrator 实现 `RegisterBuiltinOptions` 中的回调，让 @vitamin/tools 已定义的 9 个编排工具真正可用。工具定义、Hook 时机、Setting 配置都已就绪，缺的只是回调实现层。
