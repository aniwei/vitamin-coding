# Vitamin Orchestrator 任务调度器设计方案

> 基于 7 个 Agent 框架/方法论的深度对比分析，面向 vitamin 通用 agent 设计

---

## 一、七大 Agent 框架全维度对比

### 1.1 框架定位与核心架构对比

| 维度 | Superpowers (129k⭐) | Deep Agents (18.5k⭐) | Pi-Mono (29.9k⭐) | OpenDev (457⭐) | gstack (60.1k⭐) | infiAgent (1.2k⭐) | Open Agent SDK (1.6k⭐) | **vitamin** (当前) |
|------|-----|-----|-----|-----|-----|-----|-----|-----|
| **定位** | 软件开发方法论+Skill框架 | 通用 Agent Harness | 极简终端 Agent 工具包 | Rust终端 Coding Agent | CEO式开发流程框架 | 无限时长通用框架 | Claude Code开源SDK | 通用 Agent 编排器 |
| **语言** | Shell/JS/Markdown | Python (LangGraph) | TypeScript | Rust | TypeScript/Shell | Python | TypeScript | TypeScript |
| **架构风格** | Skill 触发 + 流程约束 | Graph-based DAG执行 | Extension 插件 + 最小内核 | Compound AI + Fleet | Sprint 流水线 + 角色 | 层级树 + 文件中心 | 进程内 Agent Loop | Hook拦截 + Session分层 |
| **多Agent** | Subagent-driven dev | Sub-agents (task tool) | 无内建(Extension实现) | Agent Fleet 并行 | 10-15并行Sprint | 树形层级 (Level 0-3) | Leader/Teammate Teams | 设计中 |
| **任务模型** | Plan → Task slice | write_todos + task | 极简(无内建plan) | Concurrent sessions | Think→Plan→Build→Review→Test→Ship | 层级任务树 | TaskCreate/TaskUpdate | 设计中(TaskNode图) |

### 1.2 任务调度能力对比

| 能力维度 | Superpowers | Deep Agents | Pi-Mono | OpenDev | gstack | infiAgent | Open Agent SDK | **vitamin 目标** |
|---------|-----|-----|-----|-----|-----|-----|-----|-----|
| **任务图/DAG** | ❌ 线性plan | ✅ LangGraph DAG | ❌ | ❌ 并行sessions | ❌ 线性流水线 | ⚠️ 层级树(非通用DAG) | ❌ | ✅ TaskGraphStore |
| **并行执行** | ⚠️ dispatching-parallel-agents | ⚠️ 子任务并行 | ❌ (tmux手动) | ✅ Fleet fan-out | ✅ 多Sprint并行 | ⚠️ 串行层级 | ⚠️ Agent tool | ✅ FleetManager |
| **Checkpoint/Resume** | ❌ | ✅ LangGraph checkpointer | ❌ | ❌ | ❌ | ✅ 断点恢复 | ⚠️ session resume | ✅ CheckpointCoordinator |
| **Review Gate** | ✅ 两阶段review | ❌ | ❌ (Extension) | ❌ | ✅ review routing | ❌ | ⚠️ hooks | ✅ ReviewPipeline |
| **重试策略** | ❌ | ⚠️ LangGraph retry | ❌ | ❌ | ❌ | ✅ LiteLLM重试 | ✅ 指数退避 | ✅ RetryController |
| **Circuit Breaker** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ AI分类器 | ✅ 内建 |
| **Context隔离** | ✅ 子agent独立上下文 | ✅ 隔离context window | ✅ session隔离 | ✅ 每agent独立 | ✅ worktree隔离 | ✅ 任务聚焦隔离 | ✅ 子agent隔离 | ✅ Session policy |
| **长任务identity** | ❌ | ⚠️ thread_id | ✅ session file | ⚠️ session续接 | ❌ | ✅ task_id绑定路径 | ⚠️ session ID | ✅ TaskNode.id持久 |

### 1.3 上下文管理能力对比

| 能力 | Superpowers | Deep Agents | Pi-Mono | OpenDev | gstack | infiAgent | Open Agent SDK | **vitamin** |
|------|-----|-----|-----|-----|-----|-----|-----|-----|
| **Context压缩** | ❌ | ✅ auto-summarization | ✅ compaction | ✅ Compact workflow | ❌ | ✅ 十步策略(无压缩) | ✅ 9段结构化 | ✅ Memory分层 |
| **多模型Slot** | ❌ | ⚠️ 可换模型 | ⚠️ 可切换模型 | ✅ 5 workflow slots | ❌ | ✅ 5种模型配置 | ❌ 单模型 | 设计中 |
| **Session Branching** | ❌ | ❌ | ✅ /tree 原地分支 | ❌ | ❌ | ❌ | ❌ | ✅ 已实现 |
| **Hook/拦截** | ⚠️ 流程约束 | ⚠️ LangGraph hooks | ✅ Extension events | ❌ | ❌ | ⚠️ tool/context hooks | ✅ lifecycle hooks | ✅ 31+ hook timings |
| **Steering注入** | ❌ | ❌ | ✅ message queue | ❌ | ❌ | ❌ | ❌ | ✅ steering+followUp |

### 1.4 扩展性与可嵌入性对比

| 维度 | Superpowers | Deep Agents | Pi-Mono | OpenDev | gstack | infiAgent | Open Agent SDK | **vitamin** |
|------|-----|-----|-----|-----|-----|-----|-----|-----|
| **SDK可嵌入** | ❌ 仅Skill | ✅ Python SDK | ✅ SDK+RPC | ❌ CLI | ❌ 仅Claude Code | ✅ Python SDK | ✅ Node.js SDK | ✅ 目标 |
| **Headless支持** | ❌ | ✅ | ✅ | ✅ (Web UI分离) | ❌ | ✅ Docker/CLI/WebUI | ✅ | ✅ |
| **MCP支持** | ❌ | ✅ langchain-mcp | ⚠️ Extension | ✅ opendev mcp | ❌ | ✅ per-instance | ✅ | ⚠️ tools层 |
| **自定义工具** | Skill YAML | Python function | Extension TS | ❌ | Slash Commands | Config YAML | Native function | ToolRegistry |
| **Plan模板** | ✅ writing-plans | ❌ | ❌ (Extension) | ❌ | ✅ autoplan | ❌ | ⚠️ EnterPlanMode | 设计中 |

---

## 二、关键设计模式提炼

### 2.1 从 Superpowers 提炼：Plan-Contract 与 Subagent-Driven Development

**核心洞察**：Superpowers 最有价值的不是技术实现，而是把 Plan 当作执行合同（Contract）的理念。

```
brainstorming → design doc → writing-plans → subagent-driven-development → code-review → finish
```

**对 vitamin 的启示**：
- Plan 不是 "提示语"，而是可机器消费的执行合同
- 每个 Plan Step 应映射为一个 TaskNode
- Review 不是事后附属，而是计划中的 Gate Node
- 子任务失败时的回滚和重做要在 Plan Level 定义

### 2.2 从 Deep Agents 提炼：隔离子任务 + LangGraph Checkpoint

**核心洞察**：Deep Agents 的 `task` tool 创建独立 context window 的子agent，避免长任务的上下文污染。LangGraph 的 checkpoint 机制让任何节点都可暂停/恢复。

```python
# Deep Agents 的 task 隔离模型
task(
    description="Review auth module",
    prompt="...",
    # 子agent拥有独立的context window
    # 结果通过文件系统传回
)
```

**对 vitamin 的启示**：
- 子任务必须有独立 session（已有 sessionPolicy: ephemeral | sticky | resumable）
- Checkpoint 应该成为 TaskGraphStore 的主路径能力，不是可选插件
- 恢复时需要区分 "恢复状态" vs "恢复执行"

### 2.3 从 Pi-Mono 提炼：最小内核 + Extension 强扩展

**核心洞察**：Pi 的 `pi-agent-core` 只提供 4 个内建工具（read/write/edit/bash），所有高级能力（sub-agents、plan mode、permission gates）通过 Extension 实现。

```typescript
// Pi 的 Extension API
export default function (pi: ExtensionAPI) {
  pi.registerTool({ name: "deploy", ... });
  pi.registerCommand("stats", { ... });
  pi.on("tool_call", async (event, ctx) => { ... });
}
```

**对 vitamin 的启示**：
- Orchestrator 内核应保持最小：调度 + 执行 + 状态
- Plan模式、Fleet模式、Review流水线应是可组合模块，不是不可拆分的整体
- 与 vitamin 的 HookRegistry 天然融合

### 2.4 从 OpenDev 提炼：Fleet + Workflow Model Slot

**核心洞察**：OpenDev 的 Agent Fleet 是真正的一等并行原语，每个 agent 可绑定不同模型。5个 workflow slot（Normal/Thinking/Compact/Critique/VLM）实现了精细化的模型资源分配。

```
Fleet 执行模型:
  Agent 1 → crate/agents  (claude-sonnet)
  Agent 2 → crate/http    (gpt-4o)
  Agent 3 → crate/tui     (gemini-flash)
  Agent 4 → crate/tools   (deepseek)
  ↓ 聚合结果
```

**对 vitamin 的启示**：
- Fleet 不是 "多次 background dispatch"，而是 fan-out/fan-in/race/pipeline 四种并行原语
- 每个 workflow slot 可绑定不同模型 + 不同 thinking level
- vitamin 的 ProviderRegistry + ModelRegistry 已具备支持此能力的基础

### 2.5 从 gstack 提炼：Sprint 流水线 + Review Routing

**核心洞察**：gstack 将软件开发流程建模为 `Think → Plan → Build → Review → Test → Ship` 的有向流水线，每个阶段有专门的角色（CEO/DesignReview/EngReview/QA/Release）。

**对 vitamin 的启示**：
- Orchestrator 应支持可定义的 Workflow Template
- Review routing 可根据变更类型自动选择评审路径
- 但方法论应在 Plan/Template 层表达，不应硬编码到调度内核

### 2.6 从 infiAgent 提炼：层级任务树 + 长任务 Identity + Resume

**核心洞察**：infiAgent 的 Multi-Level Agent（MLA）将 agents 组织为层级树：Level 3 顶层编排 → Level 2 功能专家 → Level 1 基础执行 → Level 0 工具定义 → Level -1 质量控制。每个任务有持久 task_id，支持天级别的长任务恢复。

```yaml
alpha_agent (Level 3)
  ├── data_collection_agent (Level 2)
  │   └── web_search_agent (Level 1)
  ├── coder_agent (Level 2)
  └── material_to_document_agent (Level 2)
```

**对 vitamin 的启示**：
- TaskNode 应支持 parentId 形成层级树
- task identity（id + workspace）应该持久化，跨 session 存活
- Resume 语义要区分：continue-plan / continue-task / continue-session / state-only

### 2.7 从 Open Agent SDK 提炼：进程内 Agent Loop + Permission Pipeline

**核心洞察**：Open Agent SDK 将 Claude Code 的完整引擎（2000+ 源文件）提取为进程内 SDK，包含4层权限管道（rules → low-risk skip → whitelist → AI classifier + circuit breaker）和9段结构化上下文压缩。

**对 vitamin 的启示**：
- Permission/安全层应独立于调度层
- Context压缩策略应可按 workflow 配置
- 进程内执行（非子进程）是正确的架构方向（vitamin 已经是）

---

## 三、vitamin orchestrator 独有优势分析

在对比所有框架后，vitamin 已具备若干竞争差异点：

| vitamin 已有能力 | 竞品覆盖情况 | 竞争优势 |
|---|---|---|
| **31+ Hook Timings** | Open Agent SDK 有lifecycle hooks, Pi有Extension events, 其余均无 | 最细粒度的拦截系统 |
| **Session Tree Branching** | Pi-Mono 有/tree, 其余均为线性 | 唯一支持树形分支的session |
| **Steering + FollowUp 双注入** | Pi-Mono 有message queue(类似), 其余无 | 最灵活的mid-loop干预 |
| **4层 AgentRegistry** | gstack 有角色, infiAgent 有level, 其余无 | 可扩展的agent发现路由 |
| **Memory 3层分级** | Open Agent SDK 有4类memory, infiAgent 有文件记忆 | 独有的prune→compact→archive渐进 |
| **Devtools Breakpoints** | 无竞品有此能力 | 唯一的agent可视化调试 |
| **transformContext回调** | Deep Agents有auto-summarization, 但不可外部注入 | 完全可插拔的上下文管道 |

---

## 四、Orchestrator 任务调度器详细设计方案

### 4.1 整体架构

```
┌──────────────────────────────────────────────────────────────────┐
│                      OrchestratorFacade                          │
│  (统一入口、生命周期管理、ToolCallbacks 适配)                       │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────┐     │
│  │ AgentRegistry │  │  EventBus    │  │ ToolCallbacksAdapter│     │
│  │ (注册/发现/   │  │ (任务事件、  │  │ (lead → orchestrator│     │
│  │  路由解析)    │  │  fleet事件、 │  │  的工具桥接)        │     │
│  │              │  │  review事件) │  │                    │     │
│  └──────┬───────┘  └──────┬───────┘  └────────┬───────────┘     │
│         │                 │                    │                 │
│  ┌──────┴────────────────┴────────────────────┴──────────┐     │
│  │                    Scheduler                           │     │
│  │  ┌──────────┐ ┌──────────────┐ ┌──────────────┐      │     │
│  │  │ReadyQueue│ │DependResolver│ │RoutingPolicy │      │     │
│  │  └────┬─────┘ └──────┬───────┘ └──────┬───────┘      │     │
│  │       │              │                │               │     │
│  │  ┌────┴──────────────┴────────────────┴──────────┐    │     │
│  │  │           RetryController                      │    │     │
│  │  │  (重试策略 + CircuitBreaker + 背压)            │    │     │
│  │  └────────────────────┬───────────────────────────┘    │     │
│  └───────────────────────┼────────────────────────────────┘     │
│                          │                                      │
│  ┌───────────────────────┼────────────────────────────────┐     │
│  │                    Executor                             │     │
│  │  ┌──────────────┐ ┌──┴───────────┐ ┌──────────────┐   │     │
│  │  │SessionFactory│ │ AgentInvoker │ │ResultNormalizer│  │     │
│  │  │  Adapter     │ │              │ │              │   │     │
│  │  └──────────────┘ └──────────────┘ └──────────────┘   │     │
│  └────────────────────────────────────────────────────────┘     │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────┐     │
│  │ FleetManager  │  │ PlanExecutor │  │CheckpointCoordinator│    │
│  │ (fan-out/in   │  │ (Plan→Tasks  │  │ (save/load/resume) │    │
│  │  race/pipeline)│  │  + gate node)│  │                    │    │
│  └──────────────┘  └──────────────┘  └────────────────────┘     │
│                                                                  │
│  ┌──────────────┐  ┌──────────────────────────────────────┐     │
│  │ReviewPipeline │  │         TaskGraphStore               │     │
│  │ (step/batch/  │  │  (节点 + 边 + 状态 + 持久化)         │     │
│  │  final/fail)  │  │                                      │     │
│  └──────────────┘  └──────────────────────────────────────┘     │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### 4.2 核心类型系统

```typescript
// ============================================================
// Task Model — 图化任务节点
// ============================================================

interface TaskNode {
  /** 全局唯一任务 ID */
  id: string
  /** 父任务 ID，形成层级树 */
  parentId?: string
  /** 依赖的前置任务 ID 列表 */
  dependsOn: string[]
  /** 任务种类 */
  kind: TaskKind
  /** 执行模式 */
  mode: TaskMode
  /** 当前状态 */
  status: TaskStatus
  /** Session 策略 */
  sessionPolicy: SessionPolicy
  /** Checkpoint 引用 */
  checkpointRef?: string
  /** 已尝试次数 */
  attempts: number
  /** 最大重试次数 */
  maxAttempts: number
  /** 任务输入 */
  input: TaskInput
  /** 任务输出 */
  output?: TaskOutput
  /** 错误信息 */
  error?: TaskError
  /** 关联的 fleet id */
  fleetId?: string
  /** 关联的 plan id */
  planId?: string
  /** 创建时间 */
  createdAt: number
  /** 最后更新时间 */
  updatedAt: number
  /** 元数据（扩展用） */
  metadata: Record<string, unknown>
}

type TaskKind = 'delegate' | 'plan_step' | 'fleet_member' | 'adhoc'
type TaskMode = 'sync' | 'background' | 'fleet' | 'plan'
type TaskStatus =
  | 'pending'        // 已创建，等待依赖
  | 'ready'          // 依赖满足，等待调度
  | 'running'        // 正在执行
  | 'waiting_review' // 等待 review gate
  | 'completed'      // 执行成功
  | 'failed'         // 执行失败
  | 'cancelled'      // 已取消
  | 'suspended'      // 已暂停（checkpoint）

type SessionPolicy = 'ephemeral' | 'sticky' | 'resumable'

interface TaskInput {
  prompt: string
  /** 指定 agent 名称 */
  agentName?: string
  /** 分类路由 hint */
  category?: string
  /** 复用的 session ID */
  sessionId?: string
  /** 系统提示补充 */
  systemPromptAppend?: string
  /** 工具白名单 */
  tools?: string[]
  /** 模型覆盖 */
  model?: ModelOverride
  /** 思考级别覆盖 */
  thinkingLevel?: ThinkingLevel
  /** 最大工具轮次 */
  maxToolTurns?: number
  /** 附件/上下文 */
  attachments?: Record<string, unknown>
}

interface TaskOutput {
  text: string
  artifacts?: Record<string, unknown>
  summary?: string
  tokenUsage?: {
    input: number
    output: number
    cacheRead: number
  }
  durationMs?: number
}

interface TaskError {
  code: string
  message: string
  retriable: boolean
  stack?: string
}

// ============================================================
// Model Slot — 多模型 Workflow 策略 (借鉴 OpenDev/infiAgent)
// ============================================================

interface ModelOverride {
  /** 主执行模型 */
  execution?: ModelSpec
  /** 思考/推理模型 */
  thinking?: ModelSpec
  /** 压缩/摘要模型 */
  compact?: ModelSpec
  /** 代码审查模型 */
  review?: ModelSpec
}

interface ModelSpec {
  provider: string
  model: string
  thinkingLevel?: ThinkingLevel
  maxTokens?: number
  temperature?: number
}

// ============================================================
// Agent Registry — 注册、发现、路由
// ============================================================

interface AgentSpec {
  name: string
  description: string
  capabilities: string[]
  /** 默认工具集 */
  tools?: string[]
  /** 默认模型策略 */
  modelOverride?: ModelOverride
  /** system prompt 模板 */
  systemPrompt?: string
  /** 最大工具轮次 */
  maxToolTurns?: number
  /** Session 策略默认值 */
  defaultSessionPolicy?: SessionPolicy
}

interface AgentRegistry {
  register(spec: AgentSpec): void
  unregister(name: string): void
  resolve(nameOrCategory: string): AgentSpec | undefined
  list(): AgentSpec[]
}

// ============================================================
// Fleet — 并行编排 (核心新增，借鉴 OpenDev)
// ============================================================

type FleetStrategy = 'fan_out_fan_in' | 'race' | 'pipeline'

interface FleetSpec {
  /** Fleet 唯一 ID */
  id: string
  /** 并行策略 */
  strategy: FleetStrategy
  /** 成员任务定义 */
  members: FleetMemberSpec[]
  /** 聚合器 (fan_out_fan_in) */
  aggregator?: FleetAggregator
  /** 超时 (ms) */
  timeoutMs?: number
  /** 最大并发数 */
  maxConcurrency?: number
}

interface FleetMemberSpec {
  /** 成员标识 */
  label: string
  /** 任务输入 */
  input: TaskInput
}

interface FleetAggregator {
  /**
   * 将所有成员的输出聚合为一个结果。
   * 由用户提供或使用默认(拼接)聚合器。
   */
  aggregate(results: Map<string, TaskOutput>): Promise<TaskOutput>
}

interface FleetResult {
  fleetId: string
  strategy: FleetStrategy
  memberResults: Map<string, TaskOutput | TaskError>
  aggregated?: TaskOutput
  durationMs: number
}

// ============================================================
// Plan — 计划执行 (借鉴 Superpowers/gstack plan-contract)
// ============================================================

interface PlanSpec {
  id: string
  title: string
  steps: PlanStep[]
  /** 全局 review 策略 */
  reviewPolicy?: ReviewPolicy
  /** checkpoint 策略 */
  checkpointPolicy?: CheckpointPolicy
}

interface PlanStep {
  id: string
  title: string
  description: string
  dependsOn: string[]
  /** 执行 input */
  input: TaskInput
  /** 该步的 review gate */
  reviewGate?: ReviewGateSpec
  /** 是否为 fleet 步骤 */
  fleetSpec?: FleetSpec
}

interface ReviewPolicy {
  /** Review 触发时机 */
  timing: 'per_step' | 'per_batch' | 'final_only' | 'on_failure'
  /** 批大小 (per_batch 时) */
  batchSize?: number
  /** 自动通过规则 */
  autoApproveRules?: ReviewAutoApproveRule[]
}

interface CheckpointPolicy {
  /** 自动 checkpoint 时机 */
  timing: 'per_step' | 'per_batch' | 'manual_only'
  batchSize?: number
}

interface PlanResult {
  planId: string
  completedSteps: string[]
  failedSteps: string[]
  skippedSteps: string[]
  totalDurationMs: number
}

// ============================================================
// Review Pipeline — 质量门控 (借鉴 Superpowers 两阶段 review)
// ============================================================

interface ReviewGateSpec {
  /** Review 类型 */
  type: 'spec_compliance' | 'code_quality' | 'security' | 'custom'
  /** 是否阻塞 */
  blocking: boolean
  /** 超时自动通过 */
  autoApproveAfterMs?: number
}

interface ReviewAutoApproveRule {
  /** 匹配条件 */
  condition: 'all_tests_pass' | 'no_critical_issues' | 'auto'
  /** 附加 checker */
  checker?: (output: TaskOutput) => Promise<boolean>
}

interface ReviewRequest {
  taskId: string
  stepId?: string
  output: TaskOutput
  gateSpec: ReviewGateSpec
}

type ReviewDecision = 'approved' | 'rejected' | 'needs_revision'

interface ReviewResult {
  decision: ReviewDecision
  feedback?: string
  decidedBy: 'human' | 'auto_rule' | 'ai_reviewer'
  timestamp: number
}

// ============================================================
// Checkpoint — 状态保存与恢复 (借鉴 Deep Agents + infiAgent)
// ============================================================

interface CheckpointRef {
  id: string
  taskId: string
  /** 保存时机 */
  trigger: 'step_complete' | 'fleet_boundary' | 'pre_review' | 'user_suspend' | 'error_recovery'
  /** 时间戳 */
  timestamp: number
  /** 任务图快照 */
  taskGraphSnapshot: TaskNode[]
  /** plan 执行进度 */
  planProgress?: {
    planId: string
    completedStepIds: string[]
    currentStepId?: string
  }
  /** session 引用 (不存储 session 内容，只存 ID) */
  sessionRefs: Map<string, string>
}

type ResumeMode =
  | 'continue_plan'       // 从 plan 断点继续
  | 'continue_task'       // 从单任务断点继续
  | 'continue_session'    // 恢复到 sticky session 继续对话
  | 'state_only'          // 仅恢复状态，不自动执行

// ============================================================
// Scheduler — 调度内核
// ============================================================

interface Scheduler {
  /** 提交任务到调度器 */
  submit(task: TaskNode): void
  /** 获取 ready queue 中的下一个任务 */
  next(): TaskNode | undefined
  /** 通知任务完成，触发依赖解析 */
  complete(taskId: string, output: TaskOutput): void
  /** 通知任务失败 */
  fail(taskId: string, error: TaskError): void
  /** 检查是否有可调度任务 */
  hasReady(): boolean
  /** 获取调度器状态快照 */
  snapshot(): SchedulerSnapshot
}

interface SchedulerSnapshot {
  pending: number
  ready: number
  running: number
  completed: number
  failed: number
}

// ============================================================
// Executor — 执行引擎
// ============================================================

interface Executor {
  /**
   * 执行一个 ready 状态的任务节点。
   * 1. 基于 AgentSpec 创建/复用 session
   * 2. 调用 session.prompt()
   * 3. 标准化输出为 TaskOutput
   * 4. 按需触发 ReviewPipeline
   */
  execute(task: TaskNode): Promise<TaskOutput>

  /**
   * 取消正在执行的任务
   */
  cancel(taskId: string): Promise<void>
}

// ============================================================
// EventBus — 事件系统
// ============================================================

interface OrchestratorEvents {
  'task:created': (task: TaskNode) => void
  'task:ready': (task: TaskNode) => void
  'task:started': (task: TaskNode) => void
  'task:completed': (task: TaskNode, output: TaskOutput) => void
  'task:failed': (task: TaskNode, error: TaskError) => void
  'task:cancelled': (task: TaskNode) => void
  'task:suspended': (task: TaskNode, checkpoint: CheckpointRef) => void
  'task:resumed': (task: TaskNode, checkpoint: CheckpointRef) => void
  'fleet:started': (spec: FleetSpec) => void
  'fleet:member_completed': (fleetId: string, label: string, output: TaskOutput) => void
  'fleet:completed': (result: FleetResult) => void
  'fleet:failed': (fleetId: string, error: TaskError) => void
  'plan:started': (spec: PlanSpec) => void
  'plan:step_completed': (planId: string, stepId: string) => void
  'plan:completed': (result: PlanResult) => void
  'plan:failed': (planId: string, error: TaskError) => void
  'review:requested': (request: ReviewRequest) => void
  'review:decided': (taskId: string, result: ReviewResult) => void
  'checkpoint:saved': (ref: CheckpointRef) => void
  'checkpoint:restored': (ref: CheckpointRef) => void
  'scheduler:snapshot': (snapshot: SchedulerSnapshot) => void
}

type OrchestratorEventBus = TypedEventEmitter<OrchestratorEvents>

// ============================================================
// Orchestrator Facade — 统一入口
// ============================================================

interface Orchestrator {
  readonly agentRegistry: AgentRegistry
  readonly eventBus: OrchestratorEventBus

  // ---- 基础任务 API ----
  dispatchTask(input: TaskInput, options?: DispatchOptions): Promise<DispatchResult>
  createTask(input: TaskInput, options?: CreateTaskOptions): Promise<TaskNode>
  getTask(id: string): Promise<TaskNode | undefined>
  listTasks(filter?: TaskFilter): Promise<TaskNode[]>
  updateTask(id: string, action: TaskAction): Promise<void>

  // ---- Plan API ----
  executePlan(plan: PlanSpec, options?: PlanOptions): Promise<PlanResult>

  // ---- Fleet API ----
  runFleet(spec: FleetSpec): Promise<FleetResult>

  // ---- Checkpoint API ----
  suspend(taskId: string): Promise<CheckpointRef>
  resume(ref: CheckpointRef, mode?: ResumeMode): Promise<void>

  // ---- Review API ----
  submitReview(taskId: string, decision: ReviewDecision, feedback?: string): Promise<void>

  // ---- 集成 API ----
  toToolCallbacks(): ToolCallbacks

  // ---- 生命周期 ----
  dispose(): void
}

interface DispatchOptions {
  mode?: TaskMode
  sessionPolicy?: SessionPolicy
  /** 是否阻塞等待结果 */
  await?: boolean
  /** 超时 */
  timeoutMs?: number
}

interface DispatchResult {
  taskId: string
  /** 同步模式下返回结果 */
  output?: TaskOutput
  /** 异步模式下返回状态 */
  status: TaskStatus
}

interface TaskFilter {
  status?: TaskStatus | TaskStatus[]
  kind?: TaskKind
  parentId?: string
  fleetId?: string
  planId?: string
}

type TaskAction =
  | { type: 'cancel' }
  | { type: 'retry' }
  | { type: 'suspend' }
  | { type: 'add_message'; message: string }
```

### 4.3 调度循环核心算法

```
MAIN SCHEDULING LOOP:

while (scheduler.hasReady() || hasRunning()) {
  // 1. 从 ready queue 取下一个任务
  task = scheduler.next()
  if (!task) { await waitForCompletion(); continue }

  // 2. 应用路由策略
  agentSpec = agentRegistry.resolve(task.input.agentName || task.input.category)

  // 3. 根据 mode 执行
  switch (task.mode) {
    case 'sync':
      output = await executor.execute(task)
      scheduler.complete(task.id, output)
      break

    case 'background':
      executor.execute(task).then(
        output => scheduler.complete(task.id, output),
        error  => scheduler.fail(task.id, error)
      )
      break

    case 'fleet':
      // 由 FleetManager 接管
      break

    case 'plan':
      // 由 PlanExecutor 接管
      break
  }

  // 4. Checkpoint policy 检查
  if (checkpointPolicy.shouldSave(task)) {
    checkpoint.save(task.id)
  }

  // 5. Review gate 检查
  if (task has review gate) {
    review = await reviewPipeline.evaluate(task)
    if (review.decision === 'rejected') {
      scheduler.fail(task.id, { retriable: true })
    }
  }
}
```

### 4.4 Fleet 并行执行策略

```
FLEET FAN-OUT/FAN-IN:

1. 创建 fleet 上下文
2. 为每个 member 创建 TaskNode (kind: fleet_member)
3. 所有 member tasks 并行提交到 scheduler
4. 尊重 maxConcurrency 限制 (semaphore)
5. 等待所有完成 (或第一个完成/失败)
6. 应用 aggregator 聚合结果

FLEET RACE:

1. 同 fan-out 创建所有 member tasks
2. 第一个完成即取消其余
3. 返回胜出者结果

FLEET PIPELINE:

1. 创建 member chain: A → B → C
2. A 的输出作为 B 的输入
3. 顺序执行，但 pipeline 内 member 共享 fleet context
```

### 4.5 模块间交互序列

```
用户请求 Plan 执行:

User → OrchestratorFacade.executePlan(planSpec)
  │
  ├→ PlanExecutor: plan steps → TaskNode[]
  │    ├→ 解析 dependsOn → 设置 task edges
  │    ├→ fleet steps → FleetSpec
  │    └→ review gates → gate markers
  │
  ├→ TaskGraphStore: 存储所有 TaskNode
  │
  ├→ Scheduler: submit(ready tasks)
  │    ├→ DependencyResolver: 计算 ready set
  │    └→ ReadyQueue: 排序 ready tasks
  │
  ├→ [loop] Scheduler.next() → Executor.execute(task)
  │    ├→ SessionFactory: create/reuse session
  │    ├→ AgentInvoker: session.prompt(...)
  │    ├→ ResultNormalizer: → TaskOutput
  │    ├→ ReviewPipeline? → gate decision
  │    ├→ CheckpointCoordinator? → save state
  │    └→ Scheduler.complete(id, output) → resolve dependents
  │
  ├→ [fleet step] FleetManager.run(fleetSpec)
  │    ├→ fan-out: parallel executor.execute()
  │    ├→ aggregator: combine results
  │    └→ Scheduler.complete(fleet node)
  │
  └→ PlanResult: summary of all steps
```

---

## 五、与 vitamin 现有架构的融合点

### 5.1 与 Agent 包的关系

```
Orchestrator                   Agent
┌──────────┐                  ┌──────────┐
│ Executor  │──creates──────→ │  Agent    │
│           │  via             │  .run()   │
│           │  SessionFactory  │           │
└──────────┘                  └──────────┘
     │                              │
     │ TaskInput → AgentRunContext   │ AgentEvents → TaskOutput
     │                              │
```

- Executor 不直接调用 `agent.run()`，而是通过 `SessionFactory` 创建 `AgentSession`，再调用 `session.prompt()`
- Agent 层的 steering/followUp 能力可通过 `task:add_message` action 触达
- Agent 的 15 种事件映射到 orchestrator 的任务级事件

### 5.2 与 Session 包的关系

| Session 能力 | Orchestrator 使用方式 |
|---|---|
| SessionManager | 通过 SessionFactory 抽象访问 |
| Session Branching | Fleet 成员可 fork 共享 session |
| Session Compaction | 长任务中由 Memory 层自动触发 |
| SessionPersistence | Checkpoint 记录 session refs |

### 5.3 与 Hooks 包的关系

| Hook Timing | Orchestrator 触发位置 |
|---|---|
| `task.created` | TaskGraphStore 新增节点后 |
| `task.completed` / `task.failed` | Executor 完成回调后 |
| `background.start` / `background.end` | Background mode task 生命周期 |
| `plan.started` / `plan.step_completed` | PlanExecutor 执行流程中 |
| `review.requested` / `review.passed` / `review.failed` | ReviewPipeline 流程中 |

### 5.4 与 Tools 包的关系

`toToolCallbacks()` 将 orchestrator 能力暴露为 agent 可调用的工具：

| Tool Callback | 映射到 Orchestrator API |
|---|---|
| `dispatch_task` | `orchestrator.dispatchTask()` |
| `create_plan` | `orchestrator.executePlan()` |
| `run_fleet` | `orchestrator.runFleet()` |
| `list_tasks` | `orchestrator.listTasks()` |
| `get_task` | `orchestrator.getTask()` |
| `update_task` | `orchestrator.updateTask()` |
| `submit_review` | `orchestrator.submitReview()` |

### 5.5 与 Memory/Persistence 包的关系

- CheckpointCoordinator 使用 `@vitamin/persistence` 的 Codec 抽象做序列化
- 长任务的 Memory 压缩不在 orchestrator 内部，通过 `transformContext` 回调由 Memory 层完成
- Orchestrator 仅记录 checkpoint refs，不存储 session 历史内容

---

## 六、分阶段实施路线

### Phase 0: 恢复最小可编译包 (Day 1-2)

**目标**: 让 `pnpm build` 通过，导出类型定义。

文件清单:
```
src/
  types.ts          — 核心类型定义 (TaskNode, FleetSpec, PlanSpec, etc.)
  event-bus.ts      — OrchestratorEventBus (基于 TypedEventEmitter)
  agent-registry.ts — AgentRegistry 实现
  task-graph-store.ts — 进程内 TaskNode 存储
  scheduler.ts      — ReadyQueue + DependencyResolver
  executor.ts       — SessionFactory → session.prompt() → TaskOutput
  routing.ts        — CompositeRouter / RoutingPolicy
  tool-callbacks.ts — toToolCallbacks() 适配器
  orchestrator.ts   — OrchestratorFacade 实现
  factory.ts        — createOrchestrator() 工厂
  index.ts          — 公共导出
```

### Phase 1: 平面任务调度 (Week 1)

**目标**: 恢复旧 dispatcher 能力下界。

- sync / background dispatch
- sticky / ephemeral session policy
- review gate (单级)
- retry + circuit breaker
- task lifecycle event bus
- toToolCallbacks() 可用

### Phase 2: 任务图 + Checkpoint (Week 2-3)

**目标**: 从平面调度升级为图调度。

- TaskNode dependsOn 依赖解析
- DependencyResolver 拓扑排序
- CheckpointCoordinator save/load
- suspend / resume API
- parentId 层级树支持

### Phase 3: Fleet 并行编排 (Week 3-4)

**目标**: 补上并行能力短板。

- FleetManager: fan_out_fan_in / race / pipeline
- maxConcurrency 信号量
- fleet 进度/取消/聚合事件
- Workflow model slot (per-task model override)

### Phase 4: Plan Workflow 模板 (Week 4-5)

**目标**: 吸收 plan-contract 价值。

- PlanExecutor: step → TaskNode 映射
- Plan review gates (per_step / per_batch / final)
- Plan checkpoint policy
- Reusable workflow template

### Phase 5: 可观测性 (Week 5-6)

**目标**: 对接 devtools 与 web-ui。

- 任务树可视化
- Plan 执行进度面板
- Fleet 并行状态监控
- Model slot 使用统计

---

## 七、明确的非目标

以下职责 **不属于** orchestrator:

1. **不做 CLI/Web UI 生命周期管理** — 属于 `@vitamin/coding` / `@vitamin/web-ui`
2. **不做 prompt 最终拼接** — 属于 `@vitamin/coding` 的 PromptManager
3. **不直接替代 session branching** — session 树是 `@vitamin/session` 的能力
4. **不做 memory compaction** — 属于 `@vitamin/memory`
5. **不做 skill marketplace / plugin host** — 属于 `@vitamin/tools` 和 Extension 层
6. **不做 MCP server 管理** — 属于 `@vitamin/tools` 层
7. **不做方法论硬编码** — Plan template/workflow 是可声明的，不是内建的

---

## 八、核心设计原则总结

| # | 原则 | 来源 | 在 vitamin 中的体现 |
|---|------|------|---------------------|
| 1 | **Plan is Contract** | Superpowers | Plan step 1:1 映射为 TaskNode，review gate 是 plan 的一部分 |
| 2 | **Context Isolation** | Deep Agents, infiAgent | 每个子任务有独立 session (ephemeral/sticky/resumable) |
| 3 | **Checkpoint as First-Class** | Deep Agents, infiAgent | checkpoint save/load 在调度主路径上，不是可选附件 |
| 4 | **Fleet as Primitive** | OpenDev | fan-out/fan-in、race、pipeline 是一等调度原语 |
| 5 | **Headless & Embeddable** | Pi-Mono | orchestrator 零 UI 依赖，可嵌入 CLI/Web/SDK/RPC |
| 6 | **Review in the Graph** | Superpowers, gstack | review 是 TaskGraph 中的 gate node，不是结果附属品 |
| 7 | **Scheduling ≠ Execution** | Pi-Mono, vitamin 自身 | Scheduler 只维护 ready queue + 依赖，Executor 负责 agent 调用 |
| 8 | **Task has Identity** | infiAgent | TaskNode.id 持久化，跨 session 存活，支持 resume |
| 9 | **Methodology ≠ Kernel** | 反面: gstack/Superpowers | workflow template 可声明配置，不硬编码到调度内核 |
| 10 | **Hook-First Extension** | vitamin 自身优势 | 31+ hook timings 覆盖 task/plan/fleet/review 生命周期 |
