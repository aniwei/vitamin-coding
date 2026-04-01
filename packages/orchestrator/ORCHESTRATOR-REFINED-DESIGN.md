# Vitamin Orchestrator 精炼设计方案

> 核心原则：**框架没有硬编码的部分不能硬编码，能给大模型决策的不能硬编码**

---

## 〇、反思：上一版方案硬编码了什么不该硬编码的东西

上一版 `ORCHESTRATOR-DESIGN-PROPOSAL.md` 和 `lead-agent-design.md` 犯了一个根本性错误——**把编排策略硬编码成运行时状态机**，而不是让 LLM 通过工具调用来驱动。

### 0.1 七大框架的"硬编码 vs LLM 决策"边界对比

| 编排决策 | Superpowers | Deep Agents | Pi-Mono | OpenDev | gstack | infiAgent | Open Agent SDK |
|---------|-------------|-------------|---------|---------|--------|-----------|---------------|
| **何时创建子任务** | 硬编码（plan step 固定） | ✅ LLM决策（`task` tool） | ✅ LLM决策（Extension tool） | LLM决策 | 硬编码（slash pipeline） | 硬编码（层级配置） | ✅ LLM决策（`TaskCreate` tool） |
| **选择哪个 agent** | 硬编码（implementer/reviewer 角色） | ✅ LLM决策（prompt 描述） | ✅ LLM无agent概念 | LLM决策 | 硬编码（角色） | 硬编码（层级） | ✅ LLM决策（agent name） |
| **串行 vs 并行** | 硬编码（dispatching-parallel flag） | ✅ LLM不管并行 | 无并行 | LLM不管 | 硬编码 | 硬编码 | ✅ LLM不管（runtime 批处理只读） |
| **何时 review** | 硬编码（HARD-GATE 必须 review） | ❌ 无 review | ❌ 无 review | ❌ 无 review | 硬编码（阶段强制） | ❌ 无 review | ✅ LLM可触发 hooks |
| **任务复杂度分级** | ❌ 无分级 | ❌ 无分级 | ❌ 无分级 | ❌ 无分级 | ❌ 无分级 | ❌ 无分级 | ❌ 无分级 |
| **Plan 格式** | Markdown（LLM 写） | ✅ `write_todos`（LLM 写） | ❌ 无 plan | ❌ 无 plan | Markdown（LLM 写） | ❌ 无 plan | ✅ `EnterPlanMode`（LLM 写） |
| **何时 checkpoint** | ❌ 不支持 | 自动（LangGraph） | ❌ 不支持 | ❌ 不支持 | ❌ 不支持 | 自动（per-step） | ❌ 不支持 |
| **Phase 流程** | Markdown 指引 | 无 phase 概念 | 无 phase 概念 | 无 phase 概念 | Markdown 指引 | 无 phase 概念 | 无 phase 概念 |

### 0.2 关键发现

**七大框架几乎没有一个把"何时创建子任务"、"选择哪个 agent"硬编码成运行时状态机。**

绝大多数框架的模式是：
1. **提供工具（tool）**：`task`, `TaskCreate`, `task_delegate` 等
2. **让 LLM 决定何时调用**：通过 system prompt 引导，但不强制
3. **运行时只做基础设施**：session 隔离、工具执行、事件传播、重试

而上一版方案硬编码了这些不该硬编码的东西：

| 硬编码的东西 | 为什么不该硬编码 | 哪些框架没硬编码 |
|-------------|----------------|----------------|
| `PhaseGateEngine` 强制 phase transition | Phase 流程是 prompt 引导不是运行时约束；Superpowers/gstack 都是 Markdown 指引 | 全部 7 个框架都没有运行时 phase 状态机 |
| `ReviewPolicy.timing: per_step \| per_batch \| final_only` | LLM 应该自己决定何时需要 review | Deep Agents、Pi-Mono、OpenDev、infiAgent 根本没有 review |
| `CheckpointPolicy.timing: per_step \| per_batch` | Checkpoint 时机应该自动或按需 | Deep Agents 用 LangGraph 自动 checkpoint |
| `ComplexityRouter` 三级分流 | LLM 自己就是最好的复杂度分类器 | 全部 7 个框架都没有独立的复杂度分类器 |
| `SubagentExecutor` 三角 review 模型 | Review 流程不是固定三角，LLM 应决定是否需要 review | 只有 Superpowers 有固定 review 流程 |
| `PlanStep.reviewGate` 在计划里嵌入 review 门禁 | Plan 是 LLM 写的，LLM 可以在 plan 里自己写 review 步骤 | Deep Agents 的 write_todos 没有 reviewGate 字段 |
| 调度循环的固定 switch/case（sync/background/fleet/plan） | 模式选择应该是 LLM 在创建任务时指定的参数 | Pi-Mono/Open Agent SDK 只有一种执行方式 |

### 0.3 当前代码现状（2026-04-01 审计）

> ⚠️ **不参考 dist/ 编译产物**，以下仅基于源码分析。

#### orchestrator/src/ — 空目录

`packages/orchestrator/src/` 完全为空。所有类型和实现需要从零开始编写。`package.json` 声明依赖 `@vitamin/dispatcher` 和 `@vitamin/plan`，但这两个包在 workspace 中**不存在**。

#### @vitamin/tools 已实现的编排工具

`packages/tools/src/orchestration/` 已有 **9 个编排工具定义**，采用回调注入模式（不依赖 orchestrator 包）：

| 工具 | 预设 | 参数 | 说明 |
|------|------|------|------|
| `task_delegate` | standard | `planId?` + `taskId?`（Plan 分发）或 `prompt` + `subagent?`/`category?`（独立分发）；`mode: 'sync'\|'background'`；`sessionId?`；`sessionMode: 'ephemeral'\|'sticky'` | 核心编排工具，融合了 plan 执行和独立任务委派 |
| `agent_call` | full | `agent`, `prompt`, `mode: 'sync'\|'async'`, `sessionId?` | 调用指定 agent 做探索/规划/review |
| `task_create` | full | `prompt`, `category?`, `subagent?` | 创建任务提交给 Dispatcher |
| `task_get` | full | `id` | 获取任务状态和结果 |
| `task_list` | full | `status?: 'all'\|'pending'\|'running'\|'completed'\|'error'` | 列出任务 |
| `task_update` | full | `id`, `action: 'cancel'\|'retry'` | 取消或重试任务 |
| `background_cancel` | full | `id` | 取消后台任务 |
| `background_output` | full | `id` | 获取后台任务输出 |
| `clarify_request` | full | `taskId`, `question`, `reason?: 'missing_context'\|'conflicting_constraints'\|'approval_needed'` | 子 agent 向父任务请求补充说明 |

此外还有 `skill_load` / `skill_execute`（full 预设）和 `session_manager`（full 预设，需注入回调）。

#### 回调注入模式 — RegisterBuiltinOptions

工具不直接依赖 orchestrator 包，而是通过 `RegisterBuiltinOptions` 接口注入回调：

```typescript
// packages/tools/src/register-builtin.ts
interface RegisterBuiltinOptions {
  callAgent: CallAgent
  loadSkill: LoadSkill
  executeSkill: ExecuteSkill
  dispatchTask: TaskDispatch    // task_delegate 的执行回调
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

#### VitaminApp 当前状态 — 编排工具全部 stub

`packages/coding/src/app/vitamin-app.ts` 中所有编排回调都返回 `{ success: false, error: '...not available...' }`，并且注册后**立即移除** orchestration 和 skill 类别的工具：

```typescript
const removeCategories = ['orchestration', 'skill'] as const
for (const category of removeCategories) {
  const names = registry.getByCategory(category).map((tool) => tool.name)
  if (names.length > 0) registry.unregister(names)
}
```

**这意味着：** 工具定义完善但无后端实现。Orchestrator 的核心工作是**实现这些回调**。

#### @vitamin/hooks 已定义的编排 Hook 时机

`packages/hooks/src/types.ts` 已定义 31 种 hook 时机，其中编排相关 9 种：

```
task.created | task.started | task.completed | task.failed | task.cancelled | task.recovered
review.requested | review.passed | review.failed
```

加上 `system-prompt.transform` 用于 phase/引导注入。

#### @vitamin/setting 已有 WorkflowConfig

`packages/setting/src/schema/workflow.ts` 已定义工作流配置：

```typescript
WorkflowConfigSchema = {
  enabled?: boolean,              // 总开关
  review?: { enabled?: boolean }, // 自动 review
  retry?: { enabled?: boolean, max_attempts?: number },
  circuit_breaker?: { enabled?: boolean, failure_threshold?: number, reset_timeout_ms?: number },
  routing?: { enabled?: boolean },
}
```

`AgentConfigSchema` 提供 per-agent 配置：`model`, `description`, `system_prompt`, `tools`, `capabilities`, `max_tool_turns`, `temperature`, `max_tokens`, `thinking_budget`, `disabled`。

`CategoriesConfigSchema` 提供 per-category 配置：`preferred_models`, `default_model`。

#### @vitamin/agent 已完善的执行层

- `workLoop()` — 流式 → 工具批处理 → steering 中断 → compaction 循环
- `ToolExecutor` — `executeSequential()` / `executeParallel()` + hook 管线
- `AgentEvent` — 15 种生命周期事件
- `AgentStatus` — idle / streaming / tool_executing / completed / error / aborted

#### @vitamin/session 已完善的会话层

- `Session<T>` — DAG 分支 + compaction + 多后端（inMemory / disk / remote）
- `CodingSessionManager` — create / get / list / remove / fork
- ephemeral / sticky 策略（`task_delegate` 的 `sessionMode` 参数已对齐）

---

## 一、精炼后的设计哲学

### 1.1 核心原则：Orchestrator = 基础设施 + 工具回调，不是流程引擎

```
❌ 旧思路：Orchestrator 是一个有 Scheduler → Executor → ReviewPipeline → Checkpoint 流水线的流程引擎
✅ 新思路：Orchestrator 实现 RegisterBuiltinOptions 中的回调函数，驱动 @vitamin/tools 已定义的编排工具
```

**当前架构已确立的集成模式：**
- `@vitamin/tools` 定义工具 schema + 参数验证（已完成）
- `RegisterBuiltinOptions` 声明回调接口（已完成）
- `VitaminApp` 注册工具 + 注入回调（已搭建，回调待实现）
- **Orchestrator 的职责 = 实现这些回调 + 提供基础设施（TaskStore、Session 编排、重试、事件广播）**

### 1.2 什么该硬编码（运行时基础设施）

这些是 **LLM 不该操心的底层机制**，必须由运行时保证：

| 硬编码的部分 | 理由 | 现有代码基础 |
|-------------|------|-------------|
| **Session 隔离** | 子任务必须有独立 context window，这是正确性保证 | ✅ `CodingSessionManager` + `sessionMode` 参数 |
| **重试 + Circuit Breaker** | API 调用失败/限流的重试是基础设施，不应让 LLM 决定 | ⚠️ `WorkflowConfig.retry` + `circuit_breaker` 已有配置 schema |
| **事件传播** | task 状态变化的事件广播是可观测性基础设施 | ⚠️ Hook 时机已定义（9 种编排事件），emit 逻辑待实现 |
| **工具执行安全** | 只读工具并发 vs mutation 串行是运行时优化，对 LLM 透明 | ✅ `ToolExecutor.executeSequential/Parallel` |
| **Token 计费** | Usage tracking 是基础设施 | ✅ `AgentState.tokenUsage` |
| **Abort/Cancel 传播** | 取消信号的级联传播是基础设施 | ✅ `AbortSignal` 贯穿 workLoop |
| **并发度上限** | 防止 LLM 创建无限子任务的安全阀 | ❌ 待实现 |
| **超时** | 防止单个任务永久挂起 | ❌ 待实现 |

### 1.3 什么不该硬编码（LLM 通过工具决策）

这些是 **LLM 应该自己判断的编排策略**：

| LLM 决策的部分 | 对应的已有工具 | 理由 |
|--------------|-------------|------|
| **何时创建子任务** | `task_delegate` / `task_create` | LLM 根据任务复杂度自行判断是自己做还是派发 |
| **给子任务什么 agent/提示** | `task_delegate` 的 `subagent`/`category`/`prompt` 参数 | LLM 构造最合适的上下文 |
| **同步 vs 后台** | `task_delegate` 的 `mode: 'sync'\|'background'` | LLM 判断是否需要等待结果 |
| **子 session 生命周期** | `task_delegate` 的 `sessionMode: 'ephemeral'\|'sticky'` | LLM 判断是否需要保持上下文 |
| **何时需要请协助** | `agent_call` (探索/规划/review) | LLM 决定找哪个 agent 协作 |
| **何时需要澄清** | `clarify_request` (向父任务请求补充) | 子 agent 自己判断信息是否充分 |
| **Plan 的内容和结构** | `task_delegate` 的 `planId` + `taskId` 模式 | LLM 写 plan，LLM 按 plan 分发 |
| **任务复杂度分级** | 无需专门工具，LLM 内在能力 | LLM 自然知道简单任务直接做、复杂任务需要 plan |
| **Phase 流程** | `system-prompt.transform` hook | 流程是建议不是约束 |
| **后台任务管理** | `background_output` / `background_cancel` | LLM 决定何时查看/取消后台任务 |

---

## 二、精炼后的架构

### 2.1 整体架构图

```
┌──────────────────────────────────────────────────────┐
│                    LLM (大模型)                       │
│  "我是编排者。我通过调用工具来管理任务、代理和审查"      │
└──────────────────────┬───────────────────────────────┘
                       │ tool calls
                       ▼
┌──────────────────────────────────────────────────────┐
│     @vitamin/tools — orchestration/ (已实现)          │
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
│  每个工具通过回调接口 (RegisterBuiltinOptions)         │
│  调用 Orchestrator 提供的实现                         │
└──────────────────────┬───────────────────────────────┘
                       │ callback invocations
                       ▼
┌──────────────────────────────────────────────────────┐
│     Orchestrator (内核) — packages/orchestrator/src   │
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
│  │ FleetExecutor (并行执行，可选 Phase 2) │           │
│  │  · fan-out/fan-in: 并行执行 + 聚合    │           │
│  │  · race: 第一个胜出取消其余            │           │
│  │  · 并发度限制 + 超时                   │           │
│  └──────────────────────────────────────┘            │
│                                                      │
└──────────────────────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────┐
│          已有基础设施层                                │
│                                                      │
│  @vitamin/agent    workLoop + ToolExecutor (✅)       │
│  @vitamin/session  Session + CodingSessionManager (✅)│
│  @vitamin/hooks    31 timings + 9 编排 hooks (✅)     │
│  @vitamin/setting  WorkflowConfig + AgentConfig (✅)  │
│  @vitamin/shared   TypedEventEmitter (✅)             │
│  @vitamin/ai       stream + ModelRegistry (✅)        │
└──────────────────────────────────────────────────────┘
```

### 2.2 与旧方案的关键差异

| 维度 | 旧方案 | 精炼方案 |
|------|--------|---------|
| **Scheduler** | 独立的调度循环 + ReadyQueue + DependencyResolver | ❌ 删除。LLM 就是调度器，它决定任务顺序 |
| **PlanExecutor** | 独立模块将 PlanStep 转为 Task + 自动执行 | ❌ 删除。LLM 写 plan、LLM 通过 `task_delegate(planId, taskId)` 逐步执行 |
| **ReviewPipeline** | 独立流水线 + 两阶段 review + 自动 retry | ❌ 删除。LLM 通过 `agent_call` 请 reviewer agent 协作 |
| **PhaseGateEngine** | 运行时状态机 + 工具守卫矩阵 | ❌ 删除。Phase 流程通过 `system-prompt.transform` hook 引导 |
| **ComplexityRouter** | 3-tier 复杂度分类器 | ❌ 删除。LLM 自己判断 |
| **RoutingPolicy** | 策略对象 + selectAgent() | ❌ 删除。LLM 在 `task_delegate` 的 `subagent`/`category` 参数里指定 |
| **Tool 定义** | orchestrator 内部定义 ToolCallbacks | ✅ **已由 @vitamin/tools 完成**。9 个编排工具已有 schema + 验证 |
| **集成模式** | `toToolCallbacks()` 方法 | ✅ **已由 RegisterBuiltinOptions 回调注入模式确立** |
| **TaskStore** | 图调度 + 拓扑排序 | ✅ 简化为 TaskStore（只存状态，不做调度） |
| **FleetExecutor** | 保留 | ⚠️ 保留设计，但当前无工具入口（无 `run_fleet` 工具） |
| **Executor** | 保留 | ✅ 保留，实现 `TaskDispatch` + `CallAgent` 等回调 |

### 2.3 删掉了什么、为什么

```
已删除模块                     理由
─────────────────────────────────────────────────────────
Scheduler (调度循环)            LLM 通过工具调用自驱动调度
  ├─ ReadyQueue                 无需 ready queue，LLM 自己知道下一步做什么
  ├─ DependencyResolver         LLM 在 plan 里描述依赖，自己按顺序执行
  └─ RoutingPolicy              LLM 在 task_delegate 的 subagent/category 参数里指定

PlanExecutor                    LLM 自己执行 plan（task_delegate 的 planId+taskId 模式）
  └─ PlanStep → Task 转换   plan 是 LLM 的笔记，不需要结构化解析

ReviewPipeline                  LLM 通过 agent_call 请 reviewer 协作
  ├─ ReviewPolicy               LLM 决定何时 review
  └─ 两阶段 review 三角模型     LLM 决定 review 策略

PhaseGateEngine                 system-prompt.transform hook 引导即可
  └─ 工具守卫矩阵               不限制 LLM 工具使用

ComplexityRouter                LLM 内在能力
SubagentExecutor                LLM 自己组织 implement→review 循环

注：以下旧方案概念已被 @vitamin/tools 工具定义取代：
  toToolCallbacks()            → RegisterBuiltinOptions 回调注入
  dispatch_task 接口           → task_delegate 已定义（含 planId/taskId 双模式）
  submit_review 接口           → agent_call 已定义（用于 review）
  plan_create/plan_get         → 待设计（可能不需要独立工具）
```

---

## 三、精炼后的类型系统

> 以下类型定义需要在 `packages/orchestrator/src/types.ts` 中实现（当前为空文件）。
> 设计原则：**与 @vitamin/tools 已定义的回调接口对齐**。

### 3.1 Task — 简化为纯状态记录

```typescript
// packages/orchestrator/src/types.ts

// ============================================================
// Task — 简单的任务记录，不含调度语义
// ============================================================

interface Task {
  id: string
  parentId?: string
  /** 任务状态 — 由 Executor 维护，不由 Scheduler 驱动 */
  status: TaskStatus
  /** Session 策略 — 对齐 task_delegate 的 sessionMode 参数 */
  sessionPolicy: 'ephemeral' | 'sticky'
  /** 绑定的 session ID（sticky 模式下复用） */
  sessionId?: string
  /** 已尝试次数（运行时自动维护） */
  attempts: number
  /** 最大重试次数（从 WorkflowConfig.retry.max_attempts 读取） */
  maxAttempts: number
  /** 输入 — 对齐 task_delegate / task_create 的参数 */
  input: TaskInput
  /** 输出 — 对齐 TaskDispatchResult */
  output?: TaskOutput
  /** 错误 */
  error?: TaskError
  /** 创建时间 */
  createdAt: number
  /** 完成/失败时间 */
  completedAt?: number
}

/**
 * 状态需兼容 task_list 工具的 status filter：
 * 'all' | 'pending' | 'running' | 'completed' | 'error'
 *
 * 注：task_list 用 'error' 而非 'failed'，Task 内部统一用 'failed'，
 * task_list 回调实现时做映射。
 */
type TaskStatus =
  | 'pending'      // 已创建，等待执行
  | 'running'      // 正在执行中
  | 'completed'    // 成功完成
  | 'failed'       // 执行失败（task_list 中显示为 'error'）
  | 'cancelled'    // 已取消

/**
 * TaskInput — 对齐 @vitamin/tools 中已定义的回调参数
 *
 * 来源对照：
 *   task_delegate: { prompt?, planId?, taskId?, subagent?, category?, mode, sessionId?, sessionMode? }
 *   task_create:   { prompt, category?, subagent? }
 *   agent_call:    { agent, prompt, mode?, sessionId? }
 */
interface TaskInput {
  /** 发给 subagent 的提示 */
  prompt: string
  /** 指定 agent 名称 — 对齐 task_delegate.subagent / agent_call.agent */
  subagent?: string
  /** 任务类别 — 对齐 task_delegate.category / task_create.category */
  category?: string
  /** 关联的 plan ID（plan 分发模式） */
  planId?: string
  /** plan 内的 task ID（plan 分发模式） */
  taskId?: string
  /** 复用的 session ID */
  sessionId?: string
  /** session 策略 — 对齐 task_delegate.sessionMode */
  sessionMode?: 'ephemeral' | 'sticky'
  /** 执行模式 — 对齐 task_delegate.mode */
  mode?: 'sync' | 'background'
}

/**
 * TaskOutput — 对齐 TaskDispatchResult（task_delegate 回调返回值）
 */
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

// ============================================================
// Agent Config — 不定义独立 AgentSpec，复用 @vitamin/setting
// ============================================================

/**
 * Agent 配置直接使用 @vitamin/setting 中的 AgentConfigSchema：
 *   { model?, description?, system_prompt?, tools?, capabilities?,
 *     max_tool_turns?, temperature?, max_tokens?, thinking_budget?, disabled? }
 *
 * Category 配置使用 CategoriesConfigSchema：
 *   { preferred_models?, default_model? }
 *
 * Orchestrator 通过 SettingsManager 读取这些配置，
 * 在执行 task_delegate 时根据 subagent/category 参数查找对应配置，
 * 传给 CodingSessionManager.createSession()。
 *
 * 不单独定义 AgentRegistry 接口 —— setting 就是注册表。
 */

// ============================================================
// Fleet — 并行执行基础设施（Phase 2，当前无对应工具）
// ============================================================

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

### 3.2 Orchestrator Facade — 实现 RegisterBuiltinOptions 回调

```typescript
// packages/orchestrator/src/types.ts (续)

// ============================================================
// Orchestrator — 核心职责是实现 @vitamin/tools 的回调接口
// ============================================================

/**
 * Orchestrator 不再定义自己的 ToolCallbacks / toToolCallbacks()。
 * 它的公共 API 就是 RegisterBuiltinOptions 中各回调的实现。
 *
 * 集成方式：
 *   const orchestrator = createOrchestrator({ ... })
 *   registerBuiltinTools(registry, projectRoot, {
 *     dispatchTask: orchestrator.dispatchTask,
 *     callAgent:    orchestrator.callAgent,
 *     createTask:   orchestrator.createTask,
 *     getTask:      orchestrator.getTask,
 *     listTasks:    orchestrator.listTasks,
 *     updateTask:   orchestrator.updateTask,
 *     getBackgroundOutput: orchestrator.getBackgroundOutput,
 *     cancelBackground:    orchestrator.cancelBackground,
 *     clarifyRequest:      orchestrator.clarifyRequest,
 *     // skill 回调独立于 orchestrator
 *   })
 */

interface Orchestrator {
  // ── 对齐 RegisterBuiltinOptions 的回调 ──

  /** task_delegate 回调 — 对齐 TaskDispatch 类型 */
  dispatchTask: import('@vitamin/tools').TaskDispatch

  /** agent_call 回调 — 对齐 CallAgent 类型 */
  callAgent: import('@vitamin/tools').CallAgent

  /** task_create 回调 — 对齐 CreateTask 类型 */
  createTask: import('@vitamin/tools').CreateTask

  /** task_get 回调 — 对齐 GetTask 类型 */
  getTask: import('@vitamin/tools').GetTask

  /** task_list 回调 — 对齐 ListTasks 类型 */
  listTasks: import('@vitamin/tools').ListTasks

  /** task_update 回调 — 对齐 UpdateTask 类型 */
  updateTask: import('@vitamin/tools').UpdateTask

  /** background_output 回调 */
  getBackgroundOutput: import('@vitamin/tools').GetBackgroundOutput

  /** background_cancel 回调 */
  cancelBackground: import('@vitamin/tools').CancelBackground

  /** clarify_request 回调 */
  clarifyRequest: import('@vitamin/tools').ClarifyRequest

  // ── 内部 API ──

  /** 内部任务存储 */
  readonly taskStore: TaskStore

  /** hook 事件发射 */
  readonly hookRegistry: import('@vitamin/hooks').HookRegistry

  // ── 生命周期 ──
  dispose(): void
}

// ============================================================
// TaskStore — 纯状态存储，不含调度语义
// ============================================================

interface TaskStore {
  create(input: TaskInput): Promise<Task>
  get(id: string): Promise<Task | undefined>
  list(filter?: { status?: TaskStatus; parentId?: string }): Promise<Task[]>
  update(id: string, patch: Partial<Task>): Promise<void>
  delete(id: string): Promise<boolean>
}
```

### 3.3 事件模型 — 复用 @vitamin/hooks 已定义的编排 Hook

```typescript
/**
 * 不定义独立的 OrchestratorEventBus。
 * Orchestrator 通过 HookRegistry.emit() 发射编排事件，
 * 复用 @vitamin/hooks 已定义的 9 种编排 hook 时机：
 *
 *   task.created   — Task 创建后
 *   task.started   — 开始执行前
 *   task.completed — 成功完成后
 *   task.failed    — 执行失败后
 *   task.cancelled — 取消后
 *   task.recovered — 重试恢复后
 *   review.requested — LLM 通过 agent_call 发起 review 时
 *   review.passed    — review 通过
 *   review.failed    — review 失败
 *
 * Hook 时机使用点号命名（task.created），不是冒号（task:created）。
 */
```

### 3.4 删掉的类型一览

```
从旧方案中删除的类型                对应的现状
────────────────────────────────────────────────────
TaskKind ('delegate' | 'plan_step' | 'fleet_member')
  → 不需要。任务就是任务，没有"种类"之分。

TaskMode ('sync' | 'background' | 'fleet' | 'plan')
  → task_delegate 已有 mode: 'sync' | 'background'。

PlanSpec / PlanStep / PlanResult
  → 删除。task_delegate 的 planId+taskId 模式让 LLM 按 plan 分发。
  → orchestrator 不解析 plan，plan 是 LLM 的笔记。

ReviewPolicy / ReviewGateSpec / ReviewRequest / ReviewResult / ReviewDecision
  → 删除。LLM 通过 agent_call 调用 reviewer agent。
  → hooks 已定义 review.requested/passed/failed 时机。

CheckpointPolicy
  → 删除。当前无 checkpoint 工具，后续按需添加。

Scheduler / ReadyQueue / DependencyResolver
  → 删除。LLM 就是调度器。

RoutingPolicy
  → 删除。LLM 在 task_delegate 的 subagent/category 参数里指定。
  → @vitamin/setting 的 AgentConfig + CategoryConfig 提供配置查找。

AgentSpec / AgentRegistry
  → 不单独定义。@vitamin/setting 的 agents + categories 配置即注册表。

OrchestratorEventBus / OrchestratorEvents
  → 不单独定义。复用 @vitamin/hooks 的 HookRegistry。

toToolCallbacks()
  → 不需要。工具已在 @vitamin/tools 定义，orchestrator 只实现回调。

ModelSpec / ModelOverride
  → 不在 orchestrator 定义。Model 选择由 @vitamin/ai ModelRegistry 管理，
    per-agent 配置由 @vitamin/setting agents.{name}.model 指定。
```

---

## 四、回调实现设计

这是精炼方案的核心——**orchestrator 实现 @vitamin/tools 已定义的回调接口，而非定义自己的工具**。

### 4.1 已有工具 → 需要实现的回调

```
已有工具 (packages/tools/src/)  →  Orchestrator 需实现的回调
─────────────────────────────────────────────────────────────
task_delegate                   →  TaskDispatch 回调
  (standard 预设)                   - Plan 模式: 根据 planId+taskId 查找 plan 内容
                                    - 独立模式: 根据 subagent 查 AgentConfig / category 查 CategoryConfig
                                    - 创建 session (ephemeral/sticky)
                                    - 调 agent.run() + workLoop
                                    - 返回 TaskDispatchResult

agent_call                      →  CallAgent 回调
  (full 预设)                       - 根据 agent name 查 AgentConfig
                                    - 创建 ephemeral session
                                    - 调 agent.run()
                                    - 支持 sync / async 模式

task_create                     →  CreateTask 回调
  (full 预设)                       - 创建 Task (status: 'pending')
                                    - 存入 TaskStore
                                    - emit task.created hook

task_get                        →  GetTask 回调
  (full 预设)                       - 从 TaskStore 查询

task_list                       →  ListTasks 回调
  (full 预设)                       - 从 TaskStore 按 status 过滤
                                    - 注意 'error' → 'failed' 映射

task_update                     →  UpdateTask 回调
  (full 预设)                       - action: 'cancel' → 取消任务 + emit task.cancelled
                                    - action: 'retry'  → 重置 status + 重新执行

background_output               →  GetBackgroundOutput 回调
  (full 预设)                       - 查询后台运行任务的当前输出

background_cancel               →  CancelBackground 回调
  (full 预设)                       - 取消后台任务 + 级联 abort

clarify_request                 →  ClarifyRequest 回调
  (full 预设)                       - 向父任务上下文注入 steering 消息
                                    - 或升级到 lead_agent / user
```

### 4.2 回调实现的核心流程 — dispatchTask

```typescript
// packages/orchestrator/src/executor.ts (核心实现逻辑)

async function dispatchTask(args: TaskDispatchArgs): Promise<TaskDispatchResult> {
  // 1. 解析 agent 配置（从 @vitamin/setting）
  const agentConfig = args.subagent
    ? settingsManager.get(`agents.${args.subagent}`)
    : args.category
      ? settingsManager.get(`categories.${args.category}`)
      : undefined

  // 2. 创建 Task
  const task = await taskStore.create({ ...args })
  await hookRegistry.emit('task.created', { taskId: task.id, ... })

  // 3. 创建/复用 session
  const session = args.sessionMode === 'sticky' && args.sessionId
    ? codingSessionManager.getSession(args.sessionId)
    : await codingSessionManager.createSession({
        model: agentConfig?.model ?? defaultModel,
        systemPrompt: agentConfig?.system_prompt ?? defaultPrompt,
        tools: resolveTools(agentConfig?.tools),
        maxToolTurns: agentConfig?.max_tool_turns ?? 25,
        thinkingLevel: agentConfig?.thinking_budget ? 'high' : 'medium',
      })

  // 4. 执行
  await hookRegistry.emit('task.started', { taskId: task.id, ... })
  try {
    const result = await session.prompt(args.prompt)
    await taskStore.update(task.id, { status: 'completed', output: result })
    await hookRegistry.emit('task.completed', { taskId: task.id, ... })
    return { success: true, output: result.text, id: task.id, status: 'completed' }
  } catch (error) {
    // 5. 重试（如果 WorkflowConfig.retry.enabled）
    if (isRetriable(error) && task.attempts < maxAttempts) {
      return retryTask(task, args)
    }
    await taskStore.update(task.id, { status: 'failed', error })
    await hookRegistry.emit('task.failed', { taskId: task.id, ... })
    return { success: false, error: error.message }
  }
}
```

### 4.3 不暴露给 LLM 的基础设施

```typescript
// 这些运行时机制对 LLM 透明，由 orchestrator 内部实现：

// 1. 重试逻辑 — 配置来自 WorkflowConfig.retry
interface RetryPolicy {
  enabled: boolean                    // ← workflow.retry.enabled
  maxAttempts: number                 // ← workflow.retry.max_attempts
  backoffMs: number
  backoffMultiplier: number
}

// 2. Circuit Breaker — 配置来自 WorkflowConfig.circuit_breaker
interface CircuitBreakerConfig {
  enabled: boolean                    // ← workflow.circuit_breaker.enabled
  failureThreshold: number            // ← workflow.circuit_breaker.failure_threshold
  resetTimeoutMs: number              // ← workflow.circuit_breaker.reset_timeout_ms
}

// 3. 并发度限制
interface ConcurrencyLimits {
  maxActiveTasks: number
  maxBackgroundTasks: number
}

// 4. Session 编排 — 复用 CodingSessionManager
//    ephemeral 模式: createSession() → prompt() → dispose()
//    sticky 模式: createSession() → 保存 sessionId → 后续 getSession() 复用
```

---

## 五、与七大框架的精准对齐

### 5.1 学 Deep Agents：`task` 工具就是全部

Deep Agents 的核心编排机制就是一个 `task` tool：
```python
task(description="Review auth module", prompt="...")
```
LLM 决定何时调用、调什么、给什么 prompt。没有 Scheduler，没有 RoutingPolicy，没有 ReviewPipeline。

**vitamin 对齐**：`task_delegate` 就是 vitamin 的 `task` tool。已实现工具定义 + 参数验证，待实现 `TaskDispatch` 回调。

### 5.2 学 Pi-Mono：最小内核 + 工具扩展

Pi-Mono 核心只有 4 个工具（read/write/edit/bash），所有高级能力通过 Extension 实现。

**vitamin 对齐**：minimal 预设 = read/write/edit/bash（4 工具）。编排工具在 standard/full 预设按需引入。`RegisterBuiltinOptions` 回调注入模式正是 Pi-Mono 的 Extension 思路。

### 5.3 学 Open Agent SDK：LLM 驱动任务创建

Open Agent SDK 的 `TaskCreate` / `TaskUpdate` 让 LLM 自己管理任务生命周期。

**vitamin 对齐**：`task_create` + `task_get` + `task_list` + `task_update(action:'cancel'|'retry')` 完全对齐。工具定义已完成。

### 5.4 学 gstack：Phase 是 Prompt 引导

gstack 的 `Think → Plan → Build → Review → Test → Ship` 是 **markdown skill 文件中的文字指引**，不是运行时状态机。

**vitamin 对齐**：Phase 引导通过 `system-prompt.transform` hook 注入，orchestrator 不强制执行。

### 5.5 学 Superpowers：Plan 是 LLM 写的文档 + agent_call 做 Review

Superpowers 的 `writing-plans` 让 LLM 生成 plan document 然后自己逐步执行。Review 由 controller LLM 发起。

**vitamin 对齐**：`task_delegate` 的 `planId + taskId` 模式让 LLM 按 plan 分发。`agent_call` 让 LLM 调 reviewer agent 协作（而非硬编码 review pipeline）。

### 5.6 学 InfiAgent：子 agent 可请求澄清

InfiAgent 允许子 agent 向上级请求更多信息。

**vitamin 对齐**：`clarify_request` 工具已定义，支持 `missing_context` / `conflicting_constraints` / `approval_needed` 三种 reason。

---

## 六、实现文件清单

### 已存在的代码（不需要新建）

```
@vitamin/tools/src/orchestration/        ✅ 9 个工具定义 + 回调类型导出
@vitamin/tools/src/register-builtin.ts   ✅ RegisterBuiltinOptions 回调注入
@vitamin/hooks/src/types.ts              ✅ 9 种编排 hook 时机定义
@vitamin/setting/src/schema/workflow.ts  ✅ WorkflowConfig（retry/circuit_breaker/review/routing）
@vitamin/setting/src/schema/agents.ts    ✅ AgentConfig per-agent 配置
@vitamin/setting/src/schema/categories.ts ✅ CategoryConfig per-category 配置
@vitamin/coding/src/session/             ✅ CodingSessionManager（create/get/fork/remove）
@vitamin/agent/src/                      ✅ Agent + workLoop + ToolExecutor
@vitamin/shared/src/event-emitter.ts     ✅ TypedEventEmitter
```

### 需要实现的文件（packages/orchestrator/src/）

```
packages/orchestrator/src/
  types.ts              — Task, TaskInput, TaskOutput, TaskError, TaskStatus, FleetSpec
  task-store.ts         — 进程内 Task 存储 (Map-based, 无调度语义)
  executor.ts           — 核心：实现 TaskDispatch + CallAgent 回调
                          (CodingSessionManager.createSession → session.prompt → 结果标准化)
  retry.ts              — RetryPolicy + CircuitBreaker（读取 WorkflowConfig）
  background-manager.ts — 后台任务管理：实现 GetBackgroundOutput + CancelBackground 回调
  clarify-handler.ts    — 实现 ClarifyRequest 回调（steering 注入 / 升级）
  orchestrator.ts       — OrchestratorFacade：组装所有回调，对外暴露 RegisterBuiltinOptions 兼容接口
  factory.ts            — createOrchestrator() 工厂函数
  index.ts              — 公共导出
```

### 需要修改的文件

```
@vitamin/coding/src/app/vitamin-app.ts
  — 当前状态：stub 回调 + 移除 orchestration 类别
  — 目标状态：注入 orchestrator 实例提供的真实回调，保留 orchestration 工具

packages/orchestrator/package.json
  — 移除不存在的 @vitamin/dispatcher 和 @vitamin/plan 依赖
  — 添加实际依赖：@vitamin/agent, @vitamin/coding, @vitamin/hooks, @vitamin/setting, @vitamin/shared
```

### 不需要的文件（与旧方案对比）

```
旧方案文件                     精炼方案
──────────────────────────────────────────
event-bus.ts                  ❌ 不需要。复用 @vitamin/hooks HookRegistry
agent-registry.ts             ❌ 不需要。复用 @vitamin/setting agents/categories 配置
tool-callbacks.ts             ❌ 不需要。工具已在 @vitamin/tools 定义
fleet-executor.ts             ⏳ Phase 2 再添加（当前无对应工具）
checkpoint-store.ts           ⏳ Phase 3 再添加（当前无对应工具）
scheduler.ts                  ❌ 永久删除
routing.ts                    ❌ 永久删除
plan-executor.ts              ❌ 永久删除
review-pipeline.ts            ❌ 永久删除
```

---

## 七、System Prompt 引导（替代硬编码的流程）

以下通过 `system-prompt.transform` hook 注入 lead agent system prompt，**替代** PhaseGateEngine / ComplexityRouter / ReviewPipeline 的运行时约束：

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

这段 prompt 引导让 LLM **自然地做出编排决策**，使用的工具名称与实际工具一致。

---

## 八、分阶段实施

### Phase 0: 最小可编译包 + package.json 修复

```
1. 移除 package.json 中不存在的 @vitamin/dispatcher 和 @vitamin/plan 依赖
2. 添加实际依赖：@vitamin/agent, @vitamin/hooks, @vitamin/setting, @vitamin/shared, @vitamin/ai
3. 创建 src/types.ts (Task, TaskInput, TaskOutput, TaskError, TaskStatus)
4. 创建 src/task-store.ts (Map-based 内存存储)
5. 创建 src/index.ts (导出类型)
```

目标：`pnpm build` 通过，类型导出可用。

### Phase 1: task_delegate + task_* 回调可用

```
1. 创建 src/executor.ts — 实现 TaskDispatch + CallAgent 回调
   核心流程：读 AgentConfig → CodingSessionManager.createSession → session.prompt → 标准化输出
2. 创建 src/retry.ts — 读取 WorkflowConfig.retry + circuit_breaker
3. 创建 src/background-manager.ts — 后台任务队列 + GetBackgroundOutput/CancelBackground 回调
4. 创建 src/orchestrator.ts — 组装所有回调
5. 创建 src/factory.ts — createOrchestrator()
6. 修改 @vitamin/coding/vitamin-app.ts — 注入真实回调，移除 stub + 移除 orchestration 工具移除逻辑
```

目标：LLM 可以通过 `task_delegate` 创建子任务、通过 `task_get/list` 查询状态、通过 `agent_call` 协作。
**VitaminApp 不再移除 orchestration 工具。**

### Phase 2: Fleet 并行（可选）

```
1. 在 @vitamin/tools 新增 run_fleet 工具定义
2. 在 RegisterBuiltinOptions 新增 runFleet 回调
3. 创建 src/fleet-executor.ts — fan_out_fan_in + race 策略
```

目标：LLM 可以通过 `run_fleet` 并行执行多个子任务。

### Phase 3: Checkpoint（可选）

```
1. 在 @vitamin/tools 新增 save_checkpoint / restore_checkpoint 工具定义
2. 创建 src/checkpoint-store.ts — 基于 @vitamin/persistence 的快照存储
```

目标：LLM 可以保存/恢复长任务状态。

---

## 九、与旧方案的总结对比

| 维度 | 旧方案 (ORCHESTRATOR-DESIGN-PROPOSAL) | 精炼方案 |
|------|---------------------------------------|---------|
| **工具定义** | orchestrator 自己定义 ToolCallbacks | ✅ **已由 @vitamin/tools 完成** — 9 个工具 |
| **集成模式** | `toToolCallbacks()` 导出 | ✅ **已由 RegisterBuiltinOptions 确立** — 回调注入 |
| **事件系统** | 独立 OrchestratorEventBus + OrchestratorEvents | ✅ **已由 @vitamin/hooks 定义** — 9 种编排 hook |
| **Agent 配置** | 独立 AgentRegistry + AgentSpec | ✅ **已由 @vitamin/setting 定义** — agents + categories |
| **基础设施配置** | orchestrator 自定义 | ✅ **已由 @vitamin/setting 定义** — WorkflowConfig |
| **Session 管理** | 独立 SessionFactory | ✅ **已由 CodingSessionManager 实现** |
| **新建代码** | ~15 个模块、~400 行类型 | ~6 个文件、~100 行类型 |
| **调度策略** | 硬编码（Scheduler + DependencyResolver） | LLM 自驱动 |
| **Plan 执行** | PlanExecutor 自动转 Task + DAG | LLM 用 `task_delegate(planId, taskId)` |
| **Review 流程** | ReviewPipeline + ReviewPolicy + 2-stage | LLM 用 `agent_call` 请 reviewer |
| **Phase 控制** | PhaseGateEngine + 工具守卫矩阵 | `system-prompt.transform` hook |
| **谁是编排者** | Scheduler 循环 | **LLM** |

**一句话总结**：

> Orchestrator 不是编排者——**LLM 才是编排者**。Orchestrator 实现 `RegisterBuiltinOptions` 中的回调，让 @vitamin/tools 已定义的 9 个编排工具（task_delegate、agent_call、task_create/get/list/update、background_output/cancel、clarify_request）真正可用。工具定义、Hook 时机、Setting 配置都已就绪，缺的只是回调实现层。
