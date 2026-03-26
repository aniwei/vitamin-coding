# @vitamin/orchestrator

多 Agent 编排引擎，为 vitamin-coding 提供任务分解、子 Agent 调度、并行执行、审查管线和工作流编排能力。

---

## 目录

- [设计动机](#设计动机)
- [核心概念](#核心概念)
- [架构总览](#架构总览)
- [模块设计](#模块设计)
  - [Workflow Engine — 工作流引擎](#workflow-engine--工作流引擎)
  - [Task Planner — 任务规划器](#task-planner--任务规划器)
  - [Agent Supervisor — Agent 监督器](#agent-supervisor--agent-监督器)
  - [SubAgent Dispatcher — 子 Agent 调度器](#subagent-dispatcher--子-agent-调度器)
  - [Review Pipeline — 审查管线](#review-pipeline--审查管线)
  - [Middleware Stack — 中间件栈](#middleware-stack--中间件栈)
  - [Context Manager — 上下文管理器](#context-manager--上下文管理器)
  - [Model Router — 模型路由器](#model-router--模型路由器)
- [与 vitamin 内部包的集成关系](#与-vitamin-内部包的集成关系)
- [数据流与生命周期](#数据流与生命周期)
- [核心类型定义](#核心类型定义)
- [API 参考](#api-参考)
- [使用示例](#使用示例)
- [设计决策与参考来源](#设计决策与参考来源)

---

## 设计动机

单一 Agent + 工具循环在处理长时间、多步骤、跨文件/跨系统的复杂任务时会遇到三个核心瓶颈：

1. **上下文污染** — 随着对话增长，Agent 的上下文窗口被无关历史稀释，决策质量下降
2. **缺乏规划** — 跳过设计直接写代码，容易偏离目标或产出低质量方案
3. **串行瓶颈** — 独立子任务不能并行，浪费时间和 token

`@vitamin/orchestrator` 借鉴 [Deep Agents](https://github.com/langchain-ai/deepagents)（中间件管线 + 子 Agent 分发 + TodoList 规划）和 [Superpowers](https://github.com/obra/superpowers)（技能驱动工作流 + 子 Agent 驱动开发 + 两阶段审查）的方案，结合 vitamin 已有的无状态 Agent、Session 持久化、三层 Memory、Hook 生命周期等基础设施，设计了一套**可组合的多 Agent 编排引擎**。

---

## 核心概念

| 概念 | 说明 |
|------|------|
| **Workflow** | 有向无环图（DAG）描述的多步骤工作流，节点是 Phase，边是转移条件 |
| **Phase** | 工作流中的一个阶段，包含一到多个 Task |
| **Task** | 最小可调度工作单元（2-5 分钟粒度），包含 spec、约束、验证条件 |
| **Supervisor** | 顶层协调者，负责监控所有子 Agent 状态、处理升级、汇总结果 |
| **SubAgent** | 被分派执行特定 Task 的独立 Agent 实例，拥有隔离上下文和 Session |
| **Review Gate** | 质量门禁，包含 Spec 合规审查和 Code 质量审查两个阶段 |
| **Middleware** | 请求/响应拦截器，用于注入规划、摘要、技能、缓存等横切关注点 |
| **Context Window** | 为每个子 Agent 精确构造的最小上下文，避免上下文污染 |

---

## 架构总览

```
┌─────────────────────────────────────────────────────────────────────┐
│                        @vitamin/orchestrator                        │
│                                                                     │
│  ┌─────────────┐    ┌──────────────┐    ┌────────────────────────┐  │
│  │  Workflow    │───▶│    Task      │───▶│   Agent Supervisor     │  │
│  │  Engine      │    │   Planner    │    │                        │  │
│  │  (DAG 执行)  │    │ (任务分解)    │    │  ┌──────────────────┐  │  │
│  └─────────────┘    └──────────────┘    │  │ SubAgent         │  │  │
│         │                                │  │ Dispatcher       │  │  │
│         │                                │  │ (分发 + 并行)     │  │  │
│         ▼                                │  └────────┬─────────┘  │  │
│  ┌─────────────┐                         │           │            │  │
│  │  Review     │◀────────────────────────│  ┌────────▼─────────┐  │  │
│  │  Pipeline   │                         │  │   SubAgent Pool  │  │  │
│  │ (两阶段审查) │                         │  │  ┌────┐ ┌────┐   │  │  │
│  └─────────────┘                         │  │  │ A1 │ │ A2 │   │  │  │
│         │                                │  │  └────┘ └────┘   │  │  │
│         ▼                                │  │  ┌────┐ ┌────┐   │  │  │
│  ┌──────────────────┐                    │  │  │ A3 │ │ A4 │   │  │  │
│  │  Middleware Stack │◀──────────────────│  │  └────┘ └────┘   │  │  │
│  │ ┌──────────────┐ │                    │  └──────────────────┘  │  │
│  │ │ Planning     │ │                    └────────────────────────┘  │
│  │ ├──────────────┤ │                                               │
│  │ │ Summarize    │ │    ┌──────────────────────────────────────┐   │
│  │ ├──────────────┤ │    │         Context Manager              │   │
│  │ │ Skills       │ │    │  (隔离构造 + Token Budget + 摘要)     │   │
│  │ ├──────────────┤ │    └──────────────────────────────────────┘   │
│  │ │ Model Router │ │                                               │
│  │ └──────────────┘ │    ┌──────────────────────────────────────┐   │
│  └──────────────────┘    │         Model Router                 │   │
│                          │  (任务复杂度 → 模型选择策略)           │   │
│                          └──────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘

  依赖的 vitamin 内部包：
  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
  │ @vitamin/ │ │ @vitamin/ │ │ @vitamin/ │ │ @vitamin/ │ │ @vitamin/ │
  │  agent   │ │  session │ │  memory  │ │  hooks   │ │  tools   │
  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘
        │            │            │            │            │
        └────────────┴────────────┴────────────┴────────────┘
                              │
                       ┌──────────┐  ┌──────────┐
                       │ @vitamin/ │  │ @vitamin/ │
                       │   ai     │  │  shared  │
                       └──────────┘  └──────────┘
```

---

## 模块设计

### Workflow Engine — 工作流引擎

工作流引擎以有向无环图（DAG）驱动多阶段执行。每个节点是一个 Phase，边携带转移条件。引擎负责按拓扑序推进、处理条件分支、管理回退与中断。

```typescript
interface Workflow {
  id: string
  name: string
  phases: Phase[]
  edges: WorkflowEdge[]
  metadata?: Record<string, unknown>
}

interface Phase {
  id: string
  name: string
  type: 'plan' | 'execute' | 'review' | 'parallel' | 'gate' | 'custom'
  /** 该阶段需要执行的 Task 列表 */
  tasks: TaskSpec[]
  /** 进入该阶段前的前置条件 */
  preconditions?: PreconditionFn[]
  /** 阶段完成后的后置检查 */
  postconditions?: PostconditionFn[]
  /** 该阶段使用的中间件（合并到全局中间件栈） */
  middleware?: OrchestratorMiddleware[]
  /** parallel 类型阶段的最大并发数 */
  concurrency?: number
}

interface WorkflowEdge {
  from: string   // Phase ID
  to: string     // Phase ID
  condition?: (result: PhaseResult) => boolean
}
```

**内置工作流模板：**

| 模板 | 阶段 | 适用场景 |
|------|------|---------|
| `coding-workflow` | brainstorm → plan → execute → review → finalize | 完整的功能开发流程 |
| `fix-workflow` | diagnose → fix → verify | Bug 修复 |
| `review-workflow` | analyze → review → report | 代码审查 |
| `parallel-debug` | triage → parallel-investigate → integrate | 多文件/多子系统调试 |

```typescript
// 创建内置工作流
const workflow = createWorkflow('coding-workflow', {
  model: 'claude-sonnet-4-6',
  tools: toolRegistry.getAvailable('standard'),
})

// 自定义工作流
const custom = defineWorkflow({
  name: 'my-pipeline',
  phases: [
    { id: 'gather', type: 'execute', tasks: [gatherRequirements] },
    { id: 'design', type: 'plan', tasks: [designArchitecture] },
    { id: 'impl', type: 'parallel', tasks: implTasks, concurrency: 3 },
    { id: 'review', type: 'review', tasks: [reviewAll] },
  ],
  edges: [
    { from: 'gather', to: 'design' },
    { from: 'design', to: 'impl' },
    { from: 'impl', to: 'review' },
    { from: 'review', to: 'impl', condition: (r) => !r.approved },
  ],
})
```

---

### Task Planner — 任务规划器

将高层意图分解为可执行的 bite-sized Task 列表。每个 Task 粒度为 2-5 分钟，包含精确的文件路径、代码片段、验证命令和预期输出。

> **设计参考：** Deep Agents 的 `write_todos` 工具 + Superpowers 的 `writing-plans` 技能

```typescript
interface TaskSpec {
  id: string
  title: string
  description: string
  status: TaskStatus
  /** 精确的文件操作清单 */
  files: TaskFileOp[]
  /** 验证条件（测试命令 + 预期结果） */
  verification?: VerificationStep[]
  /** 依赖的前置 Task ID */
  dependencies?: string[]
  /** 任务复杂度提示，用于模型路由 */
  complexity: 'low' | 'medium' | 'high'
  /** 分派给子 Agent 时携带的上下文 */
  context?: TaskContext
}

type TaskStatus =
  | 'pending'
  | 'in-progress'
  | 'done'
  | 'done-with-concerns'
  | 'needs-context'
  | 'blocked'
  | 'failed'

interface TaskFileOp {
  action: 'create' | 'modify' | 'delete'
  path: string
  /** modify 操作的行范围 */
  range?: { start: number; end: number }
}

interface VerificationStep {
  command: string
  expected: string | RegExp
}
```

**规划流程：**

```
用户意图
    │
    ▼
┌─────────────────────┐
│  1. 上下文探索       │  读取相关文件、检查现有模式
├─────────────────────┤
│  2. 方案设计         │  2-3 个方案 + 权衡分析 + 推荐
├─────────────────────┤
│  3. 任务分解         │  拆分为 bite-sized Task（2-5min 粒度）
├─────────────────────┤
│  4. 依赖排序         │  识别 Task 间依赖，构建执行 DAG
├─────────────────────┤
│  5. 自检             │  占位符扫描、类型一致性、覆盖完整性
└─────────────────────┘
    │
    ▼
  TaskSpec[]
```

---

### Agent Supervisor — Agent 监督器

顶层协调者，持有全局工作流状态，管理所有子 Agent 的生命周期。不执行具体任务，只做决策和调度。

> **设计参考：** Superpowers 的 subagent-driven-development 控制器角色

```typescript
interface Supervisor {
  /** 启动工作流执行 */
  execute(workflow: Workflow, input: SupervisorInput): AsyncIterable<WorkflowEvent>
  /** 中断当前执行 */
  abort(reason?: string): Promise<void>
  /** 注入人类反馈（steering） */
  steer(message: string): Promise<void>
  /** 获取当前执行状态快照 */
  snapshot(): WorkflowSnapshot
}

interface SupervisorInput {
  /** 用户原始意图 */
  prompt: string
  /** 运行时配置 */
  config: OrchestratorConfig
  /** 已有的会话上下文（可选） */
  sessionId?: string
}

interface WorkflowSnapshot {
  workflowId: string
  currentPhase: string
  tasks: TaskSpec[]
  activeAgents: SubAgentStatus[]
  tokenUsage: TokenUsage
  elapsed: number
}
```

**Supervisor 决策逻辑：**

- **Task 完成** → 触发 Review Gate → 通过则推进，不通过则回退修复
- **Task 需要上下文** → 提供缺失上下文后重新分派
- **Task 阻塞** → 评估阻塞原因：上下文不足则补充；模型能力不足则升级模型；任务过大则拆分；设计缺陷则升级到用户
- **Task 带顾虑完成** → 评估顾虑内容，决定是否需要额外处理
- **全部 Task 完成** → 执行最终审查，汇总结果

---

### SubAgent Dispatcher — 子 Agent 调度器

负责为每个 Task 创建独立的子 Agent 实例、构造隔离上下文、管理并行执行和结果收集。

> **设计参考：** Deep Agents 的 SubAgent/CompiledSubAgent/AsyncSubAgent 三层模型 + Superpowers 的 dispatching-parallel-agents 模式

```typescript
interface SubAgentSpec {
  /** 声明式子 Agent —— 提供配置，由调度器创建 Agent 实例 */
  type: 'declarative'
  name: string
  description: string
  role: SubAgentRole
  systemPrompt: string
  model?: string | Model
  tools?: AgentTool[]
  middleware?: OrchestratorMiddleware[]
}

interface CompiledSubAgentSpec {
  /** 预编译子 Agent —— 提供已创建的 Agent 实例 */
  type: 'compiled'
  name: string
  description: string
  agent: Agent
}

interface AsyncSubAgentSpec {
  /** 异步子 Agent —— 远程或后台执行 */
  type: 'async'
  name: string
  description: string
  endpoint?: string
  graphId?: string
}

type SubAgentRole =
  | 'implementer'     // 执行实现
  | 'spec-reviewer'   // 规格合规审查
  | 'quality-reviewer' // 代码质量审查
  | 'investigator'    // 问题调查
  | 'general'         // 通用任务

type SubAgentResultStatus =
  | 'done'
  | 'done-with-concerns'
  | 'needs-context'
  | 'blocked'
```

**调度策略：**

```typescript
interface DispatchPolicy {
  /** 最大并行子 Agent 数 */
  maxConcurrency: number
  /** 是否允许同一文件被多个子 Agent 修改 */
  allowFileConflicts: boolean
  /** 子 Agent 超时时间 */
  timeout: number
  /** 失败重试策略 */
  retry: RetryPolicy
  /** 模型路由策略 */
  modelRouting: ModelRoutingStrategy
}

interface RetryPolicy {
  maxRetries: number
  /** 重试时是否升级模型 */
  escalateModel: boolean
  /** 重试时是否拆分任务 */
  splitTask: boolean
}
```

**Session 隔离：**

每个子 Agent 通过 `SessionManager.fork()` 获得独立的 Session 分支，与父 Session 共享历史但不互相污染：

```
Parent Session (Supervisor)
    ├── Fork: SubAgent-A (Task 1)
    ├── Fork: SubAgent-B (Task 2)
    └── Fork: SubAgent-C (Task 3)
```

---

### Review Pipeline — 审查管线

两阶段质量门禁，确保每个 Task 的产出符合规格且代码质量达标。

> **设计参考：** Superpowers 的 subagent-driven-development 两阶段审查

```typescript
interface ReviewPipeline {
  /** 执行两阶段审查 */
  review(task: TaskSpec, result: SubAgentResult): Promise<ReviewResult>
}

interface ReviewResult {
  specCompliance: ReviewVerdict
  codeQuality: ReviewVerdict
  approved: boolean
  issues: ReviewIssue[]
}

interface ReviewVerdict {
  passed: boolean
  issues: ReviewIssue[]
}

interface ReviewIssue {
  severity: 'critical' | 'important' | 'minor'
  description: string
  file?: string
  line?: number
  suggestion?: string
}
```

**审查流程：**

```
SubAgent 完成 Task
        │
        ▼
┌─────────────────────┐
│ 阶段 1: Spec 合规    │  规格审查子 Agent 检查产出是否满足 TaskSpec
│                     │  ✓ 需求全覆盖，无遗漏
│                     │  ✓ 无超范围修改
│                     │  ✓ 文件路径与计划一致
└────────┬────────────┘
         │
    通过？─┤
    │     │
    │ 否  ▼
    │  ┌────────────┐
    │  │ 修复循环    │  Implementer 修复 → 重新审查
    │  └────────────┘
    │
    ▼ 是
┌─────────────────────┐
│ 阶段 2: Code 质量    │  质量审查子 Agent 检查代码质量
│                     │  ✓ 命名/结构/可读性
│                     │  ✓ 测试覆盖
│                     │  ✓ 无魔法数字/重复代码
│                     │  ✓ 错误处理
└────────┬────────────┘
         │
    通过？─┤
    │     │
    │ 否  ▼
    │  ┌────────────┐
    │  │ 修复循环    │  Implementer 修复 → 重新审查
    │  └────────────┘
    │
    ▼ 是
  ✅ Task 审查通过，标记完成
```

**关键规则：**

- Spec 合规审查**必须**先于 Code 质量审查（错误的实现质量再高也无意义）
- Critical 级别 issue 阻塞进度，必须修复后重新审查
- 审查子 Agent 使用高能力模型（需要广视野判断力）
- 修复由原 Implementer 子 Agent 执行（保持上下文连续性）

---

### Middleware Stack — 中间件栈

可组合的请求/响应拦截器栈，为 Agent 调用注入横切关注点。

> **设计参考：** Deep Agents 的中间件管线 (TodoList → Skills → Filesystem → SubAgent → Summarization → PatchToolCalls → Caching → Memory)

```typescript
interface OrchestratorMiddleware<TIn = unknown, TOut = unknown> {
  name: string
  /** 在 Agent 调用前处理 */
  before?(context: MiddlewareContext<TIn>): Promise<MiddlewareContext<TIn>>
  /** 在 Agent 调用后处理 */
  after?(context: MiddlewareContext<TIn>, result: TOut): Promise<TOut>
}

interface MiddlewareContext<T = unknown> {
  messages: AgentMessage[]
  systemPrompt: string
  tools: AgentTool[]
  model: Model
  metadata: Record<string, unknown>
  payload: T
}
```

**内置中间件：**

| 中间件 | 职责 | 执行阶段 |
|--------|------|---------|
| `PlanningMiddleware` | 注入 TodoList 工具，维护任务状态 | before |
| `SummarizationMiddleware` | 上下文摘要压缩（对接 `@vitamin/memory`） | before |
| `SkillsMiddleware` | 加载领域知识/技能注入 system prompt | before |
| `ModelRoutingMiddleware` | 按任务复杂度选择模型 | before |
| `SubAgentMiddleware` | 注入 `task` 工具，处理子 Agent 分发 | before + after |
| `ReviewMiddleware` | 在 Task 完成后自动触发审查管线 | after |
| `CachingMiddleware` | 缓存 prompt prefix（如 Anthropic prompt caching） | before |
| `MemoryMiddleware` | 持久化记忆注入 system prompt | before |
| `HumanInTheLoopMiddleware` | 指定工具调用前暂停等待人类审批 | before |

**栈执行顺序（由外到内）：**

```
请求 →  Planning → Skills → Summarization → ModelRouting
            → SubAgent → Review → Caching → Memory → HumanInTheLoop
                                                        → Agent.run()
响应 ←  HumanInTheLoop → Memory → Caching → Review
            → SubAgent → ModelRouting → Summarization → Skills → Planning
```

---

### Context Manager — 上下文管理器

为每个子 Agent 精确构造最小必要上下文，避免上下文污染，最大化有效 token 利用率。

> **设计参考：** Deep Agents 的 SummarizationMiddleware + Superpowers 的 "Controller curates exactly what context is needed"

```typescript
interface ContextManager {
  /** 为子 Agent 构造隔离上下文 */
  buildSubAgentContext(task: TaskSpec, parentContext: SessionContext): SubAgentContext
  /** 估算 token 用量 */
  estimateTokens(context: SubAgentContext): number
  /** 执行上下文压缩 */
  compact(context: SubAgentContext, budget: number): SubAgentContext
}

interface SubAgentContext {
  /** 任务描述（包含完整的 spec 文本和代码） */
  taskPrompt: string
  /** 场景设定（项目背景、约定、相关历史） */
  sceneContext: string
  /** system prompt（含技能注入） */
  systemPrompt: string
  /** 相关文件内容（只包含任务相关的文件） */
  relevantFiles: FileContent[]
  /** Token 预算 */
  tokenBudget: number
}
```

**上下文构造策略：**

1. **Task Prompt** — 直接提供完整的 TaskSpec 文本（包含代码块），子 Agent 不需要读取计划文件
2. **Scene Context** — 从父 Session 提取与当前 Task 相关的历史摘要（由 `@vitamin/memory` 的 L2 摘要提供）
3. **Relevant Files** — 仅提供 TaskSpec 中 `files` 字段涉及的文件内容
4. **Token Budget** — 按模型的 `contextWindow` 减去保留空间分配

---

### Model Router — 模型路由器

根据任务复杂度和角色自动选择最合适的模型，平衡成本与质量。

> **设计参考：** Superpowers 的 Model Selection 策略 + Deep Agents 的 `resolve_model`

```typescript
interface ModelRouter {
  /** 根据任务选择模型 */
  route(task: TaskSpec, role: SubAgentRole): Model
}

interface ModelRoutingStrategy {
  /** 低复杂度（1-2 个文件，清晰 spec）→ 快速便宜模型 */
  low: string | Model
  /** 中复杂度（多文件协调，集成关注点）→ 标准模型 */
  medium: string | Model
  /** 高复杂度（架构设计，全局判断）→ 最强模型 */
  high: string | Model
  /** 审查角色使用的模型 */
  reviewer: string | Model
}
```

**复杂度信号：**

| 信号 | low | medium | high |
|------|-----|--------|------|
| 涉及文件数 | 1-2 | 3-5 | 6+ |
| 需要跨模块理解 | 否 | 部分 | 是 |
| 需要设计判断 | 否 | 否 | 是 |
| 有完整 spec + 代码 | 是 | 部分 | 否 |
| 存在集成关注点 | 否 | 是 | 是 |

---

## 与 vitamin 内部包的集成关系

```
@vitamin/orchestrator
    │
    ├── @vitamin/agent ─────── Agent 无状态执行引擎
    │     • 创建子 Agent 实例（via AgentFactory）
    │     • 调用 Agent.run(context) 执行 Task
    │     • 监听 Agent 事件（status_change, tool_call, stream 等）
    │     • 使用 steeringQueue / followUpQueue 注入中间消息
    │
    ├── @vitamin/session ───── 消息持久化与分支
    │     • SessionManager.fork() 为子 Agent 创建隔离 Session 分支
    │     • Session.buildContext() 获取含摘要的上下文
    │     • Session.append() 持久化执行结果
    │     • 多 Session 树形管理（parent → child branches）
    │
    ├── @vitamin/memory ────── 三层记忆系统
    │     • L1 持久记忆：加载项目级知识（conventions, patterns）
    │     • L2 修剪/压缩：为子 Agent 生成上下文摘要
    │     • L3 归档：存储已完成 Task 的压缩历史
    │     • MemoryManager.process() 在子 Agent 执行前处理上下文
    │
    ├── @vitamin/hooks ─────── 18 个生命周期钩子
    │     • session.created / session.deleted — Session fork/cleanup
    │     • tool.execute.before / after — 子 Agent 工具调用监控
    │     • compaction.before / after — 上下文压缩事件
    │     • stream.start / stream.end — 流事件转发
    │     • messages.transform — 中间件消息变换
    │
    ├── @vitamin/tools ─────── 工具注册与分发
    │     • ToolRegistry.getAvailable(preset) 获取工具集
    │     • 为不同角色子 Agent 分配不同工具子集
    │     • 内置 orchestration 类工具（task delegation）
    │
    ├── @vitamin/ai ────────── 模型抽象层
    │     • ModelRegistry 获取模型定义
    │     • ProviderRegistry 创建 Provider 实例
    │     • Model Router 使用 model.cost / model.contextWindow 做路由决策
    │     • stream() 统一的流式输出
    │
    └── @vitamin/shared ────── 公共基础设施
          • TypedEventEmitter — 类型安全的事件系统
          • Error classes — 统一错误类型
          • Logger — 结构化日志
          • Token counting / truncation 工具函数
```

---

## 数据流与生命周期

### 完整的 coding-workflow 执行流

```
用户: "帮我实现 X 功能"
         │
         ▼
┌──────────────────────────────────────────────────────────┐
│ Phase 1: Brainstorm（规划阶段）                            │
│                                                          │
│  Supervisor 探索项目上下文 → 提出方案 → 用户确认设计        │
│  产出: DesignSpec                                        │
└────────────────────────┬─────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────┐
│ Phase 2: Plan（任务分解）                                  │
│                                                          │
│  TaskPlanner 将 DesignSpec 分解为 TaskSpec[]              │
│  构建依赖 DAG，识别可并行的 Task 组                        │
│  产出: TaskSpec[] + 执行计划                               │
└────────────────────────┬─────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────┐
│ Phase 3: Execute（并行子 Agent 执行）                      │
│                                                          │
│  对每个 Task:                                             │
│  ① ContextManager.buildSubAgentContext() 构造隔离上下文    │
│  ② ModelRouter.route() 选择合适模型                       │
│  ③ SessionManager.fork() 创建 Session 分支                │
│  ④ SubAgent Dispatcher 创建并分派子 Agent                  │
│  ⑤ 子 Agent 执行: 读文件 → 写代码 → 跑测试 → 提交         │
│  ⑥ 子 Agent 返回结果 + 状态                               │
│                                                          │
│  独立 Task 并行执行（受 maxConcurrency 限制）              │
│  有依赖的 Task 按 DAG 顺序串行                             │
└────────────────────────┬─────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────┐
│ Phase 4: Review（两阶段审查）                              │
│                                                          │
│  对每个已完成 Task:                                       │
│  阶段 1: Spec 合规审查 → 不通过则修复循环                   │
│  阶段 2: Code 质量审查 → 不通过则修复循环                   │
│  全部通过 → Task 标记完成                                  │
│  ✗ 有 critical issue → 回退到 Phase 3 修复                │
└────────────────────────┬─────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────┐
│ Phase 5: Finalize（最终整合）                              │
│                                                          │
│  最终全局审查 → 合并所有子 Agent 产出 → 汇总报告            │
│  提供选项: merge / PR / keep / discard                    │
└──────────────────────────────────────────────────────────┘
```

### Agent 事件流

Orchestrator 通过 `@vitamin/hooks` 和 Agent 事件系统实现全链路可观测：

```typescript
type WorkflowEvent =
  | { type: 'workflow:start'; workflow: Workflow }
  | { type: 'workflow:phase_enter'; phase: Phase }
  | { type: 'workflow:phase_exit'; phase: Phase; result: PhaseResult }
  | { type: 'workflow:complete'; summary: WorkflowSummary }
  | { type: 'workflow:error'; error: Error }
  | { type: 'task:start'; task: TaskSpec }
  | { type: 'task:status_change'; task: TaskSpec; status: TaskStatus }
  | { type: 'task:complete'; task: TaskSpec; result: SubAgentResult }
  | { type: 'subagent:spawn'; agentId: string; task: TaskSpec }
  | { type: 'subagent:stream'; agentId: string; event: StreamEvent }
  | { type: 'subagent:complete'; agentId: string; result: SubAgentResult }
  | { type: 'review:start'; task: TaskSpec; stage: 'spec' | 'quality' }
  | { type: 'review:verdict'; task: TaskSpec; verdict: ReviewVerdict }
  | { type: 'review:fix_loop'; task: TaskSpec; iteration: number }
  | { type: 'steering:inject'; message: string }
  | { type: 'token:usage'; usage: TokenUsage }
```

---

## 核心类型定义

```typescript
// ─── 配置 ───────────────────────────────────────────────

interface OrchestratorConfig {
  /** 默认模型 */
  model: string | Model
  /** 模型路由策略 */
  modelRouting?: ModelRoutingStrategy
  /** 可用工具集 */
  tools?: AgentTool[]
  /** 工具预设 (minimal | standard | full) */
  toolPreset?: ToolPreset
  /** 中间件栈 */
  middleware?: OrchestratorMiddleware[]
  /** 子 Agent 规格 */
  subagents?: (SubAgentSpec | CompiledSubAgentSpec | AsyncSubAgentSpec)[]
  /** 技能目录 */
  skills?: string[]
  /** 持久记忆路径 */
  memory?: string[]
  /** 调度策略 */
  dispatch?: DispatchPolicy
  /** 审查配置 */
  review?: ReviewConfig
  /** 最大总 token 预算 */
  maxTokenBudget?: number
  /** 人工审批门禁 */
  interruptOn?: Record<string, boolean | InterruptConfig>
}

interface ReviewConfig {
  /** 是否启用两阶段审查 */
  enabled: boolean
  /** Spec 审查模型 */
  specReviewModel?: string | Model
  /** 质量审查模型 */
  qualityReviewModel?: string | Model
  /** 最大修复迭代次数 */
  maxFixIterations: number
}

interface InterruptConfig {
  /** 需要人工确认的条件 */
  condition?: (context: MiddlewareContext) => boolean
  /** 超时自动放行 */
  timeout?: number
}

// ─── 执行结果 ───────────────────────────────────────────

interface PhaseResult {
  phaseId: string
  status: 'completed' | 'failed' | 'skipped'
  tasks: TaskResult[]
  approved?: boolean
  tokenUsage: TokenUsage
  duration: number
}

interface TaskResult {
  taskId: string
  status: TaskStatus
  agentId: string
  output?: string
  concerns?: string[]
  reviewResult?: ReviewResult
  tokenUsage: TokenUsage
  duration: number
}

interface SubAgentResult {
  status: SubAgentResultStatus
  output: string
  concerns?: string[]
  filesModified: string[]
  testsRun?: { passed: number; failed: number; skipped: number }
}

interface WorkflowSummary {
  workflowId: string
  phases: PhaseResult[]
  totalTasks: number
  completedTasks: number
  failedTasks: number
  totalTokens: TokenUsage
  totalDuration: number
}

interface TokenUsage {
  input: number
  output: number
  cacheRead: number
  total: number
}
```

---

## API 参考

### `createOrchestrator(config)`

创建编排器实例。

```typescript
function createOrchestrator(config: OrchestratorConfig): Orchestrator

interface Orchestrator {
  /** 执行预定义工作流 */
  run(workflow: Workflow, input: string): AsyncIterable<WorkflowEvent>
  /** 执行单个 Task（不经过完整工作流） */
  dispatch(task: TaskSpec): Promise<TaskResult>
  /** 并行执行一组独立 Task */
  dispatchParallel(tasks: TaskSpec[]): AsyncIterable<WorkflowEvent>
  /** 中断执行 */
  abort(reason?: string): Promise<void>
  /** 注入人类反馈 */
  steer(message: string): Promise<void>
  /** 获取状态快照 */
  snapshot(): WorkflowSnapshot
  /** 释放资源 */
  dispose(): Promise<void>
}
```

### `createWorkflow(template, overrides?)`

从内置模板创建工作流。

```typescript
function createWorkflow(
  template: 'coding-workflow' | 'fix-workflow' | 'review-workflow' | 'parallel-debug',
  overrides?: Partial<OrchestratorConfig>
): Workflow
```

### `defineWorkflow(definition)`

自定义工作流定义。

```typescript
function defineWorkflow(definition: {
  name: string
  phases: Phase[]
  edges: WorkflowEdge[]
  middleware?: OrchestratorMiddleware[]
}): Workflow
```

### `planTasks(intent, context?)`

将高层意图分解为 Task 列表。

```typescript
function planTasks(
  intent: string,
  context?: { files?: string[]; model?: string | Model }
): Promise<TaskSpec[]>
```

---

## 使用示例

### 基础用法：执行完整开发工作流

```typescript
import { createOrchestrator, createWorkflow } from '@vitamin/orchestrator'

const orchestrator = createOrchestrator({
  model: 'claude-sonnet-4-6',
  toolPreset: 'standard',
  modelRouting: {
    low: 'claude-haiku-3',
    medium: 'claude-sonnet-4-6',
    high: 'claude-opus-4-6',
    reviewer: 'claude-sonnet-4-6',
  },
  review: {
    enabled: true,
    maxFixIterations: 3,
  },
  dispatch: {
    maxConcurrency: 3,
    timeout: 300_000,
    allowFileConflicts: false,
    retry: { maxRetries: 2, escalateModel: true, splitTask: false },
  },
})

const workflow = createWorkflow('coding-workflow')

for await (const event of orchestrator.run(workflow, '实现用户认证模块')) {
  switch (event.type) {
    case 'workflow:phase_enter':
      console.log(`进入阶段: ${event.phase.name}`)
      break
    case 'task:status_change':
      console.log(`任务 ${event.task.title}: ${event.status}`)
      break
    case 'subagent:stream':
      process.stdout.write(event.event.text ?? '')
      break
    case 'review:verdict':
      console.log(`审查: ${event.verdict.passed ? '✅' : '❌'}`)
      break
    case 'workflow:complete':
      console.log(`完成! 共 ${event.summary.completedTasks} 个任务`)
      break
  }
}

orchestrator.dispose()
```

### 并行调试场景

```typescript
import { createOrchestrator } from '@vitamin/orchestrator'

const orchestrator = createOrchestrator({
  model: 'claude-sonnet-4-6',
  toolPreset: 'standard',
  dispatch: { maxConcurrency: 4, allowFileConflicts: false },
})

// 三个独立的测试文件失败，并行调查
const tasks = [
  {
    id: 'fix-1',
    title: '修复 agent-abort.test.ts',
    description: '3 个超时相关测试失败...',
    complexity: 'medium' as const,
    files: [{ action: 'modify' as const, path: 'tests/agent-abort.test.ts' }],
    status: 'pending' as const,
  },
  {
    id: 'fix-2',
    title: '修复 batch-completion.test.ts',
    description: '2 个工具执行测试失败...',
    complexity: 'low' as const,
    files: [{ action: 'modify' as const, path: 'tests/batch-completion.test.ts' }],
    status: 'pending' as const,
  },
  {
    id: 'fix-3',
    title: '修复 race-condition.test.ts',
    description: '1 个竞态条件测试失败...',
    complexity: 'high' as const,
    files: [{ action: 'modify' as const, path: 'tests/race-condition.test.ts' }],
    status: 'pending' as const,
  },
]

for await (const event of orchestrator.dispatchParallel(tasks)) {
  // 三个子 Agent 并行工作
}
```

### 自定义工作流

```typescript
import { defineWorkflow, createOrchestrator } from '@vitamin/orchestrator'

const migrationWorkflow = defineWorkflow({
  name: 'database-migration',
  phases: [
    {
      id: 'analyze',
      name: '分析现有 Schema',
      type: 'execute',
      tasks: [analyzeSchemaTask],
    },
    {
      id: 'generate',
      name: '生成迁移脚本',
      type: 'execute',
      tasks: [generateMigrationTask],
    },
    {
      id: 'dry-run',
      name: '干运行验证',
      type: 'gate',
      tasks: [dryRunTask],
      postconditions: [(result) => result.output.includes('no errors')],
    },
    {
      id: 'apply',
      name: '执行迁移',
      type: 'execute',
      tasks: [applyMigrationTask],
    },
  ],
  edges: [
    { from: 'analyze', to: 'generate' },
    { from: 'generate', to: 'dry-run' },
    { from: 'dry-run', to: 'apply', condition: (r) => r.approved === true },
    { from: 'dry-run', to: 'generate', condition: (r) => r.approved === false },
  ],
})

const orchestrator = createOrchestrator({ model: 'claude-sonnet-4-6' })
for await (const event of orchestrator.run(migrationWorkflow, '将 users 表拆分为 users + profiles')) {
  // ...
}
```

---

## 设计决策与参考来源

### 从 Deep Agents 借鉴

| 特性 | Deep Agents 实现 | vitamin/orchestrator 适配 |
|------|-----------------|-------------------------|
| **中间件管线** | `TodoList → Filesystem → SubAgent → Summarization → PatchToolCalls → Caching → Memory` 线性栈 | 同样采用线性中间件栈，但通过 `@vitamin/hooks` 提供更细粒度的生命周期拦截 |
| **子 Agent 三层模型** | `SubAgent` (声明式) + `CompiledSubAgent` (预编译) + `AsyncSubAgent` (远程异步) | 直接复用三层模型，`SubAgent` 对接 `@vitamin/agent` 的 `AgentFactory`，`AsyncSubAgent` 支持远程部署 |
| **TodoList 规划** | `write_todos` 工具嵌入 Agent，模型自主管理任务列表 | `TaskPlanner` 作为独立模块在 Agent 外部管理，可被 Supervisor 监控和修正 |
| **上下文摘要** | `SummarizationMiddleware` 自动压缩长对话 | 对接 `@vitamin/memory` 的三层系统 (L1 持久化 + L2 修剪/压缩 + L3 归档) |
| **通用子 Agent** | 自动注入 `general-purpose` 子 Agent | 支持同样的默认子 Agent，但角色更细分 (implementer / reviewer / investigator) |

### 从 Superpowers 借鉴

| 特性 | Superpowers 实现 | vitamin/orchestrator 适配 |
|------|-----------------|-------------------------|
| **工作流技能链** | brainstorm → writing-plans → subagent-driven-development → code-review → finishing | 形式化为 DAG 工作流引擎，Phase 节点 + 条件边 + 回退支持 |
| **子 Agent 驱动开发** | 控制器分派 Implementer → Spec Reviewer → Quality Reviewer，修复循环直到通过 | `ReviewPipeline` 实现两阶段审查，`Supervisor` 处理修复循环和状态升级 |
| **并行 Agent 调度** | 独立问题域各派一个 Agent 并行调查 | `SubAgentDispatcher.dispatchParallel()` + `DispatchPolicy.maxConcurrency` |
| **模型按复杂度路由** | 机械任务用便宜模型、集成任务用标准模型、架构任务用最强模型 | `ModelRouter` + `ModelRoutingStrategy` + `TaskSpec.complexity` 信号 |
| **Implementer 状态处理** | DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED 四种状态 | 直接复用为 `SubAgentResultStatus`，`Supervisor` 按状态做升级决策 |
| **Fresh Context per Task** | 控制器精确构造每个子 Agent 的上下文，不继承 session 历史 | `ContextManager.buildSubAgentContext()` + `SessionManager.fork()` |
| **计划粒度** | bite-sized task (2-5 min)，含完整代码、路径、验证命令 | `TaskSpec` 结构完整对应（files, verification, dependencies, context） |

### vitamin 自有创新

| 特性 | 说明 |
|------|------|
| **DAG 工作流引擎** | 不同于 Superpowers 的线性技能链，支持条件分支、并行阶段、循环回退 |
| **Session 分支隔离** | 利用 `@vitamin/session` 的 `fork()` 能力实现子 Agent Session 树，比 Deep Agents 的 StateBackend 更轻量 |
| **18 点 Hook 生命周期** | 比 Deep Agents 的中间件栈更细粒度，可在 tool.execute / stream / compaction 等精确时机注入逻辑 |
| **三层 Memory 集成** | 比 Deep Agents 的 `MemoryMiddleware`（只加载 AGENTS.md）更强大，支持 L1 持久 + L2 压缩 + L3 归档 |
| **统一事件流** | `WorkflowEvent` 聚合工作流、任务、子 Agent、审查、token 等全链路事件，支持 devtools 可视化 |
