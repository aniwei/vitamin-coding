# Plan 系统重新设计技术方案

> 版本: v2.0 — 2026-03-30
> 范围: `@vitamin/orchestrator`, `@vitamin/coding`, `@vitamin/tools`, `@vitamin/session`, `@vitamin/memory`

---

## 一、问题分析与设计目标

### 1.1 现有系统不足

当前 Plan 系统是**文件驱动、步骤线性推进**的模型：

1. **Plan 来源单一** — 必须预先存在 `.plan.md` 文件，LLM 无法在对话中动态生成计划
2. **无结构化持久化** — `PlanFileStore` 仅做 markdown 文件读写，无法持久化到远程服务，也无法在重启后关联回 session
3. **任务拆分机械** — `perform_work` 每次取 next pending step 推进，LLM 无法根据上下文动态拆分/合并/重排步骤
4. **SubAgent 无差异化** — 所有步骤都走同一个 fallback agent，没有按任务类型匹配 specialized subagent
5. **Skill 未集成** — `SkillAdapter` 是 stub，plan 无法引用 skill 作为执行单元
6. **无渐进披露** — Plan 的全部上下文（goal、architecture、所有步骤 body）在首次加载时全量注入，没有按需读取策略

### 1.2 设计目标

| 目标 | 描述 |
|------|------|
| G1: 动态生成 + 持久化 | LLM 编写计划后，通过 `plan_create` 工具持久化（本地 JSON + 可选远程同步） |
| G2: 智能任务拆分 | LLM 根据 plan 生成结构化任务列表，并在 dispatch 前为 task 生成 TaskExecutionSpec |
| G3: AgentSpec 运行时生成 | 静态 AgentProfile 与 TaskExecutionSpec 在运行时组装为 AgentSpec，不再预注册完整执行 spec |
| G4: Dispatch 驱动执行 | 任务通过 `task_delegate` 工具分发（orchestrator 内部 callback 仍为 `dispatchTask`），保持 Lead Agent 编排控制权 |
| G5: Skill 驱动装配 | skill 由模型基于 plan/task 生成 TaskExecutionSpec 后选择，用于组装 AgentSpec |
| G6: 渐进披露 | Session 恢复时按需加载 plan 上下文；memory 惰性读取 |

---

## 二、核心概念模型

```
┌────────────────────────────────────────────────────────────────┐
│                        Lead Agent                              │
│  (编排者：理解用户意图 → 制定计划 → 拆分任务 → 分发执行)          │
└────────────┬──────────────────────────┬────────────────────────┘
             │ plan_create / plan_update │ task_delegate
             ▼                          ▼
┌─────────────────────┐    ┌─────────────────────────────────────┐
│   PlanStore          │    │        Dispatcher                   │
│   (持久化层)          │    │  ┌──────────┐ ┌──────────────────┐ │
│                      │    │  │ TaskQueue │ │ ProfileRegistry  │ │
│  ┌──────────────┐    │    │  └────┬─────┘ │ (agent profiles) │ │
│  │ LocalStore    │    │    │       │       └────────┬─────────┘ │
│  │ (JSON files)  │    │    │       ▼                │           │
│  ├──────────────┤    │    │  ┌────────────┐         │           │
│  │ RemoteStore   │    │    │  │ Runtime    │◄────────┘           │
│  │ (API sync)    │    │    │  │ AgentSpec  │                    │
│  └──────────────┘    │    │  └────────────┘                    │
└─────────────────────┘    └─────────────────────────────────────┘
```

### 2.1 Plan 数据模型（v2）

```typescript
// ═══ Plan Definition（计划定义） ═══

interface Plan {
  id: string                    // UUID
  version: number               // 乐观锁版本号
  name: string
  goal: string
  constraints?: string[]        // 约束条件
  architecture?: string         // 架构说明
  tasks: PlanTask[]             // 任务列表（有序、可依赖）
  status: PlanStatus
  sessionId: string             // 关联的 session
  createdAt: number
  updatedAt: number
  completedAt?: number
  metadata?: Record<string, unknown>
}

type PlanStatus = 'draft' | 'active' | 'paused' | 'completed' | 'failed' | 'cancelled'

// ═══ PlanTask（计划任务） ═══

interface PlanTask {
  id: string                    // task-1, task-2, ...
  title: string
  description: string           // 任务的详细描述（LLM 编写）
  type: TaskType                // 任务类型 → 决定 agent profile 选择
  status: PlanTaskStatus
  dependencies?: string[]       // 依赖的 task id 列表
  files?: string[]              // 涉及的文件
  estimatedComplexity?: 'low' | 'medium' | 'high'
  execution?: TaskExecutionSpec // 运行时补充的执行规格，不是 plan_create 必填字段
  output?: PlanTaskOutput
  error?: PlanTaskError
  attempts: number
  startedAt?: number
  completedAt?: number
}

type TaskType =
  | 'code_generation'           // 编写新代码
  | 'code_modification'         // 修改现有代码
  | 'refactoring'               // 重构
  | 'testing'                   // 编写/运行测试
  | 'debugging'                 // 调试问题
  | 'research'                  // 代码探索/调研
  | 'documentation'             // 文档编写
  | 'review'                    // 代码审查
  | 'infrastructure'            // 构建/配置/CI
  | 'custom'                    // 自定义

type PlanTaskStatus = 'pending' | 'ready' | 'running' | 'completed' | 'failed' | 'skipped' | 'blocked'

interface PlanTaskOutput {
  summary: string
  text?: string
  artifacts?: Record<string, unknown>
  subagentResultStatus?: 'done' | 'done_with_concerns' | 'needs_context' | 'blocked'
}

interface PlanTaskError {
  code: string
  message: string
  retriable?: boolean
}

// ═══ Task Execution Spec（执行规格） ═══

interface TaskExecutionSpec {
  agentProfile?: string         // 最终选用的 agent profile
  requiredSkills?: string[]     // 组装 runtime agent spec 时需要加载的 skill
  tools?: string[]              // 额外工具白名单 / allowlist
  workflowSlot?: string         // exploration / execution / review / custom
  modelTier?: 'fast' | 'standard' | 'powerful'
  maxToolTurns?: number
  systemPromptAddendum?: string // 对 runtime system prompt 的附加约束
  generatedAt?: number
}
```

说明：
- `Plan` / `PlanTask` 只表达工作分解本身，即要做什么（what）
- `TaskExecutionSpec` 表达执行装配策略，即如何做（how）
- `AgentSpec` 是 dispatch 前由运行时最终组装的可执行配置，才是 agent loop 真正消费的 spec
- `PlanTaskStatus` 与现有 orchestrator 层的 `OrchestratorTask.status` 分层，避免与当前 `packages/orchestrator` 中已存在的 `TaskStatus` 重名冲突；`PlanTaskOutput` / `PlanTaskError` 也不直接复用调度层的输出与错误结构。

---

## 三、Plan 持久化存储

### 3.1 存储架构

```
PlanStore (interface)
  ├── LocalPlanStore       (JSON 文件持久化)
  ├── RemotePlanStore      (远程 API 同步)
  └── CompositePlanStore   (本地优先 + 远程同步)
```

### 3.2 PlanStore 接口

```typescript
interface PlanStore {
  // ═══ CRUD ═══
  create(plan: Plan): Promise<Plan>
  get(planId: string): Promise<Plan | undefined>
  update(planId: string, patch: Partial<Plan>): Promise<Plan>
  delete(planId: string): Promise<boolean>

  // ═══ 查询 ═══
  listBySession(sessionId: string): Promise<PlanSummary[]>
  listByStatus(status: PlanStatus): Promise<PlanSummary[]>
  getActive(sessionId: string): Promise<Plan | undefined>

  // ═══ 任务级操作 ═══
  updateTask(planId: string, taskId: string, patch: Partial<PlanTask>): Promise<Plan>
  getReadyTasks(planId: string): Promise<PlanTask[]>   // 依赖已满足的 pending 任务

  // ═══ 版本控制 ═══
  getVersion(planId: string): Promise<number>
}

interface PlanSummary {
  id: string
  name: string
  status: PlanStatus
  taskCount: number
  completedCount: number
  createdAt: number
  updatedAt: number
}
```

### 3.3 LocalPlanStore 实现

```
~/.vitamin/plans/                    # 全局计划
  {planId}.plan.json                 # 计划定义文件
.vitamin/plans/                      # 项目级计划
  {planId}.plan.json
```

文件格式:
```json
{
  "version": 1,
  "plan": {
    "id": "a1b2c3d4",
    "name": "重构认证模块",
    "goal": "将单体认证逻辑拆分为独立微服务...",
    "tasks": ["..."],
    "status": "active",
    "sessionId": "sess-xyz",
    "createdAt": 1711756800000,
    "updatedAt": 1711756800000
  }
}
```

设计要点:
- **原子写入**: 写 `.tmp` → `rename` 保证不出半写文件
- **乐观锁**: `version` 字段递增，并发修改时 reject
- **单 active 约束**: 同一 `sessionId` 同时最多只有一个 `active` plan；`plan_create` 如果发现已有 active plan，默认先将旧 plan 置为 `paused`，再写入新 plan
- **向后兼容**: 保留从旧版 `.plan.md` 文件导入的能力（`PlanLoader.load()` → `PlanStore.create()`）

### 3.4 RemotePlanStore 实现

```typescript
interface RemotePlanStoreOptions {
  baseUrl: string            // e.g. https://api.vitamin.dev/v1
  authToken: string | (() => Promise<string>)
  timeout?: number           // 默认 10s
}
```

REST 映射:
```
POST   /plans                → create
GET    /plans/{id}           → get
PATCH  /plans/{id}           → update
DELETE /plans/{id}           → delete
GET    /plans?session={sid}  → listBySession
PATCH  /plans/{id}/tasks/{tid} → updateTask
```

### 3.5 CompositePlanStore（本地优先策略）

```typescript
class CompositePlanStore implements PlanStore {
  constructor(
    private local: LocalPlanStore,
    private remote?: RemotePlanStore,
  ) {}

  async create(plan: Plan): Promise<Plan> {
    const saved = await this.local.create(plan)
    // 异步同步到远程，失败不阻塞
    this.remote?.create(saved).catch(this.handleSyncError)
    return saved
  }

  async get(planId: string): Promise<Plan | undefined> {
    // 优先本地，miss 时拉远程
    const local = await this.local.get(planId)
    if (local) return local
    if (!this.remote) return undefined
    const remote = await this.remote.get(planId)
    if (remote) await this.local.create(remote) // 回填本地
    return remote
  }
}
```

---

## 四、LLM 任务拆分与 AgentSpec 运行时组装

### 4.1 Plan 创建流程

```
┌───────────────┐    plan_create tool     ┌──────────────┐
│  Lead Agent   │ ──────────────────────► │  PlanStore   │
│  (理解意图,    │                         │  (持久化)     │
│   编写 plan)  │ ◄────────── plan ────── │              │
└───────┬───────┘                         └──────────────┘
        │
        │  LLM 根据 plan.goal + plan.architecture
        │  拆分出 PlanTask[]，每个 task 指定 type
        │
        ▼
┌───────────────┐    task_delegate tool    ┌──────────────┐
│  Lead Agent   │ ──────────────────────► │  Dispatcher  │
│  (逐个/并行    │                         │  (路由到      │
│   分发 task)  │ ◄────── result ──────── │  subagent)   │
└───────────────┘                         └──────────────┘
```

**关键设计决策**：Lead Agent 保持编排控制权。LLM（Lead Agent）本身完成：
1. 理解用户意图
2. 编写 plan（调用 `plan_create` 持久化）
3. 分析 plan 中每个 task 的 type、依赖关系
4. 逐步调用 `task_delegate` 分发执行
5. 收集结果、处理失败、调整计划

### 4.2 Plan 相关工具（Tools）

#### `plan_create` — 创建计划

```typescript
const PlanCreateSchema = z.object({
  name: z.string().describe('计划名称'),
  goal: z.string().describe('计划目标'),
  architecture: z.string().optional().describe('架构说明'),
  constraints: z.array(z.string()).optional().describe('约束条件'),
  tasks: z.array(z.object({
    title: z.string(),
    description: z.string(),
    type: z.enum([
      'code_generation', 'code_modification', 'refactoring',
      'testing', 'debugging', 'research', 'documentation',
      'review', 'infrastructure', 'custom'
    ]),
    dependencies: z.array(z.string()).optional(),
    files: z.array(z.string()).optional(),
    estimatedComplexity: z.enum(['low', 'medium', 'high']).optional(),
  })),
})
```

返回: `{ planId, taskCount, status: 'active' }`

#### `plan_update` — 更新计划

支持操作:
- 添加/移除任务
- 修改任务描述
- 调整依赖关系
- 暂停/恢复计划
- 标记计划完成/取消

#### `plan_get` — 获取计划详情

**渐进披露**: 默认只返回 summary 视图（id、name、goal、任务标题+状态列表），通过 `detail: 'full'` 参数获取完整内容。

```typescript
const PlanGetSchema = z.object({
  planId: z.string().optional(),
  sessionId: z.string().optional(),
  detail: z.enum(['summary', 'full']).optional().default('summary'),
})
```

#### `plan_list` — 列出计划

```typescript
const PlanListSchema = z.object({
  status: z.string().optional(),
  sessionId: z.string().optional(),
})
```

#### `task_delegate`（增强现有 agent-facing tool）

说明：
- Agent 暴露的工具名继续使用 `task_delegate`，避免破坏现有 ToolRegistry、测试与 prompt 约定
- `dispatchTask` 继续保留为 orchestrator 内部 callback 名
- Phase A 不引入新的 `task_dispatch` 工具名；如未来需要，只作为兼容别名进入后续阶段

增强点：
- 接受 `planId` + `taskId` 参数，自动从 plan 中获取 task 描述作为 prompt 上下文
- 如果 `task.execution` 不存在或已过期，先由 planner/selector 基于 plan + task 生成 `TaskExecutionSpec`
- **自动 profile 路由**: 根据 `task.type` → `TaskType-AgentProfile` 映射选择合适的 agent profile
- 根据 `task.execution.requiredSkills` 惰性加载 skill，并将 skill context 拼入 AgentSpec 的 system prompt
- 执行完毕自动更新 `PlanStore` 中任务状态
- Phase A 不引入 `parallel` 参数；独立任务并行通过多次 `mode: 'background'` 调用完成，批量接口留到 Phase C 再单独设计

```typescript
const TaskDelegateSchema = z.object({
  // 方式 A: 从 plan 分发
  planId: z.string().optional(),
  taskId: z.string().optional(),          // 指定任务；不指定则取下一个 ready 任务
  // 方式 B: 独立分发（保持向后兼容）
  prompt: z.string().optional(),
  subagent: z.string().optional(),
  category: z.string().optional(),
  // 通用
  mode: z.enum(['sync', 'background']).default('sync'),
  sessionMode: z.enum(['ephemeral', 'sticky']).default('ephemeral'),
})
```

### 4.3 静态 AgentProfile + 运行时 AgentSpec

Vitamin 在这里需要明确拆成两层：

1. **RegisteredAgentProfile**：注册表里的静态模板，描述某类 agent 的默认能力、prompt 模板和工具/模型偏好
2. **AgentSpec**：dispatch 前由运行时根据 `plan + task + TaskExecutionSpec + skills + available tools` 组装出的最终可执行规格

也就是说，**真正应该在运行时生成的是 AgentSpec**。静态注册的不是最终 AgentSpec，而是 AgentProfile / Blueprint。

```typescript
// ═══ 静态 AgentProfile（注册表中的模板） ═══

interface RegisteredAgentProfile {
  name: string
  taskTypes: TaskType[]
  capabilities: string[]
  systemPromptTemplate: string
  defaultTools?: string[]
  preferredModelTier: 'fast' | 'standard' | 'powerful'
  defaultMaxToolTurns: number
  thinkingLevel?: 'low' | 'medium' | 'high'
}

// ═══ 运行时 AgentSpec（真正执行时消费） ═══

interface AgentSpec {
  name: string
  sourceProfile: string
  model: string
  systemPrompt: string
  tools: string[]
  maxToolTurns: number
  workflowSlot?: string
  metadata?: {
    planId?: string
    taskId?: string
    generatedAt?: number
  }
}

interface AgentProfileRegistry {
  register(profile: RegisteredAgentProfile): void
  get(name: string): RegisteredAgentProfile | undefined
  resolve(query: { name?: string; category?: string }): RegisteredAgentProfile | undefined
}
```

#### 内置 AgentProfile 列表

| Name | TaskTypes | 核心能力 | 默认工具集 | 默认 Model Tier |
|------|-----------|---------|-----------|------------------|
| `coder` | `code_generation`, `code_modification` | 编写高质量代码 | `file_write`, `file_read`, `shell`, `search`, `lsp_*` | standard |
| `refactorer` | `refactoring` | 安全重构 | `file_write`, `file_read`, `lsp_*`, `search`, `shell` | powerful |
| `tester` | `testing` | 测试编写与运行 | `file_write`, `file_read`, `shell`, `test_run` | standard |
| `debugger` | `debugging` | 问题定位与修复 | `file_read`, `shell`, `lsp_*`, `search`, `file_write` | powerful |
| `researcher` | `research` | 代码探索与分析 | `file_read`, `search`, `shell`, `lsp_*` | fast |
| `documenter` | `documentation` | 文档编写 | `file_write`, `file_read`, `search` | fast |
| `reviewer` | `review` | 代码审查 | `file_read`, `search`, `lsp_*`, `shell` | powerful |
| `infra` | `infrastructure` | 构建/配置 | `file_write`, `file_read`, `shell` | standard |

#### AgentSpec 组装示例

```typescript
function buildAgentSpec(
  profile: RegisteredAgentProfile,
  plan: Plan,
  task: PlanTask,
  execution: TaskExecutionSpec,
  skillContext?: string,
): AgentSpec {
  const systemPrompt = profile.systemPromptTemplate
    .replace('{plan_goal}', plan.goal)
    .replace('{plan_architecture}', plan.architecture ?? '')
    .replace('{plan_constraints}', (plan.constraints ?? []).join('\n'))
    .replace('{task_title}', task.title)
    .replace('{task_description}', task.description)
    .replace('{task_files}', (task.files ?? []).join(', '))
    + (execution.systemPromptAddendum ? `\n\n## Execution Notes\n${execution.systemPromptAddendum}` : '')
    + (skillContext ? `\n\n## Skill Reference\n${skillContext}` : '')

  return {
    name: `${profile.name}:${task.id}`,
    sourceProfile: profile.name,
    model: resolveModelForTier(execution.modelTier ?? profile.preferredModelTier),
    systemPrompt,
    tools: execution.tools ?? profile.defaultTools ?? [],
    maxToolTurns: execution.maxToolTurns ?? profile.defaultMaxToolTurns,
    workflowSlot: execution.workflowSlot,
    metadata: {
      planId: plan.id,
      taskId: task.id,
      generatedAt: Date.now(),
    },
  }
}
```

说明：当前 `SessionFactory.createSession()` 已经直接消费 `model / systemPrompt / tools / maxToolTurns`，这和 `AgentSpec` 的最终形态天然一致。因此这里最稳妥的重构方向不是继续预注册完整 AgentSpec，而是在 dispatch 前组装出 AgentSpec，再直接交给 SessionFactory。

#### AgentProfile 自动注册

在 `createOrchestratorRuntime()` 中，自动注册 builtin profiles 与用户配置 profiles。注册表保存的是静态 profile，不是最终 runtime spec。

```typescript
// 1. 先注册 builtin profiles
for (const profile of BUILTIN_AGENT_PROFILES) {
  agentProfileRegistry.register(profile)
}

// 2. 再注册用户配置 profiles；同名时以后者覆盖 builtin defaults
registerProfiles(agentProfileRegistry, userProfiles, fallbackProfile)
```

### 4.4 TaskType → AgentProfile 路由

```typescript
// ═══ 路由表 ═══

const TASK_TYPE_PROFILE_MAP: Record<TaskType, string> = {
  code_generation: 'coder',
  code_modification: 'coder',
  refactoring: 'refactorer',
  testing: 'tester',
  debugging: 'debugger',
  research: 'researcher',
  documentation: 'documenter',
  review: 'reviewer',
  infrastructure: 'infra',
  custom: '__fallback__',
}

// ═══ 路由逻辑 ═══

function resolveAgentProfileForTask(
  task: PlanTask,
  agentProfileRegistry: AgentProfileRegistry,
): RegisteredAgentProfile {
  // 1. 优先使用 task.execution 中已决议的 agent profile
  if (task.execution?.agentProfile) {
    const explicit = agentProfileRegistry.get(task.execution.agentProfile)
    if (explicit) return explicit
  }

  // 2. 按最终 registry 查找（builtin 先注册，用户同名配置后注册可覆盖）
  const byType = TASK_TYPE_PROFILE_MAP[task.type]
  const registered = agentProfileRegistry.get(byType)
  if (registered) return registered

  // 3. 走 category/capability 路由策略（CompositeRouter）
  const resolved = agentProfileRegistry.resolve({ category: task.type })
  if (resolved) return resolved

  // 4. fallback
  return agentProfileRegistry.get('__fallback__')!
}
```

### 4.5 Dispatch 执行流程（增强版）

```
Lead Agent 调用 task_delegate({ planId, taskId })
  │
  ▼
┌──────────────────────────────────────────────┐
│  1. 从 PlanStore 获取 plan + task            │
│  2. 检查 task.dependencies 是否全部 completed │
│     → 否: 返回 blocked                       │
│  3. 生成或读取 task.execution:               │
│     - planner/selector 基于 plan + task       │
│       产出 TaskExecutionSpec                  │
│  4. 解析 agent profile:                      │
│     - task.execution.agentProfile            │
│       > TASK_TYPE_PROFILE_MAP > router       │
│  5. 加载 skill context                        │
│     - 从 task.execution.requiredSkills 惰性读 │
│  6. 组装 AgentSpec                    │
│     - profile + task.execution + skills       │
│  7. 更新 PlanStore: task.status = 'running'  │
│  8. Dispatcher 内部使用 AgentSpec     │
│     调用 SessionFactory.createSession(...)   │
│  9. 收集结果 → 更新 PlanStore:               │
│     task.status = 'completed' / 'failed'     │
│     task.output = result                     │
│ 10. 保存 checkpoint                          │
│ 11. 检查 plan 整体完成度                      │
│ 12. 返回结果给 Lead Agent                    │
└──────────────────────────────────────────────┘
```

---

## 五、Skill 引用与集成

### 5.1 Skill 在 TaskExecutionSpec / AgentSpec 运行时组装 中的角色

Skill 是**可复用的领域知识包**（SKILL.md 文件），包含：
- 专业化的指令/约束
- 推荐的工具使用模式
- 检查清单/验收标准

核心原则：**Plan 不直接持有 `skillRefs`**。Plan 只负责定义任务；skill 由 planner/selector 在分析 plan 后，为具体 task 生成 `TaskExecutionSpec.requiredSkills`，再用于组装 AgentSpec。

推荐分层：

1. **Plan / PlanTask**: 描述工作分解、依赖、文件范围、复杂度
2. **TaskExecutionSpec**: 描述执行策略，包括 agentProfile、requiredSkills、tool allowlist、workflow slot
3. **AgentSpec 运行时组装**: 根据 `TaskExecutionSpec` 实际加载 skill，并组装 AgentSpec

如果产品需要让用户可见执行策略，可以把 `TaskExecutionSpec` 作为 runtime-enriched 字段回写到 `PlanTask.execution`，但它不是 `plan_create` 的输入必填项。

### 5.2 SkillAdapter 实现方案

```typescript
interface SkillDefinition {
  name: string
  description: string
  instructions: string           // SKILL.md 正文（不含 frontmatter）
  tools?: string[]               // 该 skill 推荐的工具
  checklist?: string[]           // 验收清单
}

interface SkillAdapter {
  load(path: string): Promise<{ success: boolean; name?: string; error?: string }>
  execute(name: string, input?: string): Promise<{ success: boolean; output?: string; error?: string }>
  getContext(name: string): Promise<string | undefined>
}

class DefaultSkillAdapter implements SkillAdapter {
  private cache = new Map<string, SkillDefinition>()

  async load(path: string): Promise<{ success: boolean; name?: string; error?: string }> {
    // 1. 读取 SKILL.md 文件
    // 2. 解析 YAML frontmatter + body
    // 3. 缓存到 this.cache
    // 4. 返回 skill name
  }

  async execute(name: string, input?: string): Promise<{ success: boolean; output?: string }> {
    // skill 不是"执行"，是"提供上下文"
    // 返回 skill instructions + checklist 作为 output
    const skill = this.cache.get(name)
    if (!skill) return { success: false, error: 'Skill not loaded' }
    return {
      success: true,
      output: this.formatSkillContext(skill),
    }
  }

  async getContext(name: string): Promise<string | undefined> {
    const skill = this.cache.get(name)
    return skill ? this.formatSkillContext(skill) : undefined
  }
}
```

说明：这里要求同步扩展 orchestrator 层 `SkillAdapter` 接口，新增 `getContext(name)`；否则后续的 task prompt 装配无法通过接口层闭环表达。

### 5.3 Skill 在 Plan Dispatch 中的注入点

```typescript
// 在 task_delegate 执行时：
async function ensureTaskExecutionSpec(
  plan: Plan,
  task: PlanTask,
): Promise<TaskExecutionSpec> {
  if (task.execution) return task.execution

  // 由 planner / selector 根据 plan + task 生成执行规格
  return {
    agentProfile: TASK_TYPE_PROFILE_MAP[task.type],
    requiredSkills: deriveRequiredSkills(plan, task),
    workflowSlot: 'execution',
    generatedAt: Date.now(),
  }
}

async function prepareAgentSpec(
  plan: Plan,
  task: PlanTask,
  profile: RegisteredAgentProfile,
  skillAdapter: SkillAdapter,
): Promise<AgentSpec> {
  const execution = await ensureTaskExecutionSpec(plan, task)
  const skillContextParts: string[] = []

  // 根据执行规格按需加载 skill
  for (const skillName of execution.requiredSkills ?? []) {
    const loaded = await skillAdapter.load(skillName)
    if (loaded.success) {
      const ctx = await skillAdapter.getContext(skillName)
      if (ctx) skillContextParts.push(ctx)
    }
  }

  return buildAgentSpec(
    profile,
    plan,
    task,
    execution,
    skillContextParts.length > 0 ? skillContextParts.join('\n\n---\n\n') : undefined,
  )
}
```

说明：`deriveRequiredSkills(plan, task)` 可以是规则引擎，也可以是一次轻量 planner 模型调用；文档推荐先做“规则优先 + 模型补充”的混合策略，避免每次 dispatch 都额外触发一次高成本规划。真正交给 agent loop 的应当是 `AgentSpec`，而不是 registry 中的静态 profile。

---

## 六、渐进披露与 Session 恢复

### 6.1 渐进披露策略

**核心原则**: 不在 system prompt 中注入所有 plan 细节；只在需要时按需加载。

| 层次 | 内容 | 注入时机 | 持久化位置 |
|------|------|---------|-----------|
| L0: Plan 摘要 | name + goal + task 标题/状态列表 | session 恢复时自动注入 | PlanStore |
| L1: 当前任务详情 | task description + files + execution spec 摘要 | task_delegate 调用时 | PlanStore |
| L2: Skill 内容 | SKILL.md instructions + checklist | AgentSpec 组装时惰性加载 | SkillAdapter cache |
| L3: 完整上下文 | architecture + constraints + 所有 task body | 显式 plan_get(detail:'full') | PlanStore |

#### Session 恢复流程

```
Session 恢复（用户重新打开/切换到已有 session）
  │
  ▼
1. CodingSessionManager.restore(sessionId) / restoreAll()
  — 恢复消息历史（已有机制）
  │
  ▼
2. PlanStore.getActive(sessionId)
  — 查找该 session 关联的 active plan
  │
  ▼
3. 构建 plan 摘要注入到恢复 context:

   "## Active Plan: {plan.name}
    Goal: {plan.goal}
    Progress: {completed}/{total} tasks

    Tasks:
    - [x] task-1: Setup project structure
    - [x] task-2: Implement data layer
    - [ ] task-3: Build API endpoints (NEXT)
    - [ ] task-4: Add authentication
    - [ ] task-5: Write tests

    Use plan_get for full details."
  │
  ▼
4. Lead Agent 继续编排 — 调用 plan_get / task_delegate 按需获取更多上下文
```

### 6.2 Memory 按需读取

与 `@vitamin/memory` 集成:
- Plan 相关的长期知识写入 `~/.vitamin/memory/plans/` 目录
- 每次 plan 完成后，可选择将 plan 摘要 + lessons learned 持久化为 memory
- session 恢复时，只注入 plan 摘要（L0）；更详细的 memory 通过既有 `messages.transform` / `ResourceManager` 链路按需补充，Phase A 不新增 `memory_read` tool

实现要求：
- 在 `packages/coding/src/session/coding-session-manager.ts` 的 `restore(id)` 与 `restoreAll()` 中，在 `AgentSession` materialize 后 emit `session.restored`
- 在 `packages/hooks/src/types.ts` 中同时补充 `HookTiming` 与 `HookPayloadMap`，否则该 hook 无法被注册和消费

```typescript
// Hook: session 恢复时注入 plan 摘要
hookRegistry.on('session.restored', 'plan-context-injector', async (ctx) => {
  const { sessionId, messages } = ctx
  const activePlan = await planStore.getActive(sessionId)
  if (!activePlan) return

  // 注入 L0 摘要作为 system context
  const summary = buildPlanSummary(activePlan)
  messages.unshift({
    role: 'system',
    content: summary,
  })
})
```

### 6.3 Plan 与 Session 关联

```
Session
  └── has many → Plan (via sessionId)
                  └── has many → PlanTask (embedded in Plan)
                                  └── maps to → OrchestratorTask (via dispatch)
```

**session 切换时的行为**:
- 切换到另一个 session → 加载该 session 的 active plan 摘要
- 同一 session 可有多个 plan（历史 plan 为 completed/cancelled，只有一个 active）
- Plan 跨 session 共享: 不直接支持（每个 plan 绑定一个 session）；如需协作，通过 RemotePlanStore 实现

---

## 七、包级改动清单

### 7.1 `@vitamin/orchestrator`

| 文件 | 动作 | 说明 |
|------|------|------|
| `types.ts` | 修改 | 新增 `Plan`, `PlanTask`, `PlanTaskStatus`, `PlanStatus`, `PlanStore`, `TaskExecutionSpec`, `RegisteredAgentProfile`, `AgentSpec` 类型，并扩展 `SkillAdapter.getContext()` |
| `plan-store.ts` | 新建 | `PlanStore` 接口 + `LocalPlanStore` + `RemotePlanStore` + `CompositePlanStore` 实现 |
| `agent-profile-registry.ts` | 新建/改造 | 保存静态 `RegisteredAgentProfile`，替代“预注册完整 AgentSpec”的思路 |
| `agent-profiles.ts` | 新建 | 8 个内置 AgentProfile 定义（prompt 模板 + 默认配置） |
| `agent-spec-factory.ts` | 新建 | 基于 profile + task.execution + skills 组装 `AgentSpec` |
| `task-execution-planner.ts` | 新建 | 根据 `plan + task` 生成或刷新 `TaskExecutionSpec`，为 AgentSpec 组装提供输入 |
| `task-type-router.ts` | 新建 | `TaskType → AgentProfile` 路由逻辑 |
| `plan-loader.ts` | 修改 | 保留 markdown 解析能力；增加转换函数 `markdownToPlan()` 用于旧格式导入 |
| `plan-run.ts` | 修改 | 适配新 `Plan` 模型（`PlanRun.planId` 指向 `Plan.id`） |
| `orchestrator.ts` | 修改 | `toToolCallbacks` 增加 `planCreate`, `planUpdate`, `planGet`, `planList` 回调；`task_delegate(planId+taskId)` 先产出 `AgentSpec`，再经 Dispatcher / SessionFactory 执行 |
| `events.ts` | 修改 | 新增 `plan.created`, `plan.updated`, `plan.task_dispatched` 事件 |

### 7.2 `@vitamin/tools`

| 文件 | 动作 | 说明 |
|------|------|------|
| `orchestration/plan-create.ts` | 新建 | `plan_create` 工具 |
| `orchestration/plan-update.ts` | 新建 | `plan_update` 工具 |
| `orchestration/plan-get.ts` | 新建 | `plan_get` 工具（支持 summary/full 模式） |
| `orchestration/plan-list.ts` | 新建 | `plan_list` 工具 |
| `orchestration/task-delegate.ts` | 修改 | 继续沿用 agent-facing 名称 `task_delegate`，增强支持 `planId + taskId`；内部改为“解析 profile → 生成 AgentSpec → 执行” |
| `orchestration/perform-work.ts` | 删除/弃用 | 不再作为对外入口；计划推进统一由 Lead Agent 通过 `task_delegate` 决策与分发 |
| `skill/skill-load.ts` | 修改 | 对接真正的 SkillAdapter 实现 |
| `skill/skill-execute.ts` | 修改 | 对接真正的 SkillAdapter 实现 |

### 7.3 `@vitamin/coding`

| 文件 | 动作 | 说明 |
|------|------|------|
| `app/vitamin-app.ts` | 修改 | `createOrchestratorRuntime()` 注入 PlanStore + 注册 builtin agent profiles；保留用户配置 profiles 覆盖默认值 |
| `lead/prompt-manager.ts` | 修改 | Lead prompt 中描述 plan 工具使用方式 + 可用 agent profile 类型列表 |
| `app/session-factory-adapter.ts` | 校准/少量修改 | 明确其消费的是运行时生成的 `model / systemPrompt / tools / maxToolTurns`，无需再依赖预注册完整 AgentSpec |
| `session/coding-session-manager.ts` | 修改 | 在 `restore(id)` / `restoreAll()` 中 emit `session.restored`，触发 plan 摘要注入 |

### 7.4 `@vitamin/session`

| 文件 | 动作 | 说明 |
|------|------|------|
| `types.ts` | 修改 | `SessionMetadata` 增加 `activePlanId?: string` |

### 7.5 `@vitamin/hooks`

| 文件 | 动作 | 说明 |
|------|------|------|
| `types.ts` | 修改 | 增加 `session.restored` hook timing，并补全对应 `HookPayloadMap` 载荷 |

---

## 八、Lead Agent Prompt 策略

### 8.1 Plan 编排指令（注入到 Lead System Prompt）

```markdown
## Plan Management

You have access to a structured planning system. For complex multi-step tasks:

1. **Create a plan** using `plan_create` with:
   - A clear goal and architecture overview
   - Tasks broken down by type (code_generation, testing, refactoring, etc.)
   - Dependencies between tasks (task-2 depends on task-1, etc.)
   - File scope for each task

2. **Dispatch tasks** using `task_delegate` with `planId` + `taskId`:
  - Tasks are first mapped to an agent profile, then assembled into a AgentSpec before execution
  - Before dispatch, the runtime may generate or refresh a TaskExecutionSpec, including required skills
  - Dispatch tasks in dependency order; independent tasks can run concurrently by issuing multiple `mode: 'background'` calls
  - Monitor results and adjust the plan if needed

3. **Check progress** using `plan_get` (summary view by default)

### Available Task Types → Sub-Agents:
| Type | Sub-Agent | Best For |
|------|-----------|----------|
| code_generation | coder | Writing new code |
| code_modification | coder | Modifying existing code |
| refactoring | refactorer | Safe code restructuring |
| testing | tester | Writing and running tests |
| debugging | debugger | Finding and fixing bugs |
| research | researcher | Code exploration and analysis |
| documentation | documenter | Documentation writing |
| review | reviewer | Code quality review |
| infrastructure | infra | Build, config, CI setup |

### When to create a plan:
- Multi-file changes spanning 3+ files
- Tasks requiring different expertise (e.g., code + tests + docs)
- Work that may span multiple sessions
- Complex refactoring or feature implementation

### When NOT to create a plan:
- Simple single-file edits
- Quick questions or lookups
- One-shot code generation
```

---

## 九、数据流时序图

### 9.1 完整 Plan 生命周期

```
User: "重构认证模块，拆分为独立微服务"
  │
  ▼
Lead Agent:
  1. 分析代码结构 (调用 search/read 工具)
  2. 设计重构方案
  3. 调用 plan_create({
       name: "重构认证模块",
       goal: "将认证逻辑从 monolith 拆分...",
       architecture: "新建 auth-service 包...",
       tasks: [
         { id: "task-1", title: "创建 auth-service 包结构",
           type: "infrastructure", files: [...] },
         { id: "task-2", title: "迁移认证逻辑",
           type: "code_modification", dependencies: ["task-1"], files: [...] },
         { id: "task-3", title: "编写单元测试",
           type: "testing", dependencies: ["task-2"], files: [...] },
         { id: "task-4", title: "更新依赖引用",
           type: "refactoring", dependencies: ["task-2"], files: [...] },
         { id: "task-5", title: "代码审查",
           type: "review", dependencies: ["task-3", "task-4"] },
       ],
     })
  │
  ├─ PlanStore.create() → 持久化到 .vitamin/plans/abc123.plan.json
  ├─ TaskExecutionPlanner.analyze(plan)
  │  → 为 task-3 生成 `agentProfile: 'tester'`
  │  → 为 task-3 生成 `requiredSkills: ['testing-conventions']`
  ├─ AgentSpecFactory.build(task-3)
  │  → 组装最终 model/systemPrompt/tools/maxToolTurns
  │
  ▼
  4. 调用 task_delegate({ planId, taskId: "task-1" })
     → 路由到 `infra` subagent
     → SubAgent 执行 → 完成
     → PlanStore: task-1 status = completed
  │
  5. task_delegate({ planId, taskId: "task-2" })
     → 路由到 `coder` subagent
     等 task-2 完成后:
  │
  6. task-3 和 task-4 可并行（都仅依赖 task-2）:
     task_delegate({ planId, taskId: "task-3" })
       → 路由到 `tester` subagent
       → skill "testing-conventions" 内容注入到 prompt
     task_delegate({ planId, taskId: "task-4", mode: "background" })
       → 路由到 `refactorer` subagent
  │
  7. task_delegate({ planId, taskId: "task-5" })
     → 路由到 `reviewer` subagent
     → ReviewGate 自动对审查结果进行质量校验
  │
  ▼
Lead Agent: "重构完成，以下是变更摘要..."
```

### 9.2 Session 恢复流程

```
用户重新打开终端 / 切换到已有 session
  │
  ▼
CodingSessionManager.restore(sessionId) / restoreAll()
  ├─ 加载消息历史
  └─ 触发 hook: session.restored
     │
     ▼
     plan-context-injector hook:
       ├─ PlanStore.getActive(sessionId)
       │   → 找到 plan "重构认证模块" (3/5 tasks completed)
       └─ 注入 L0 摘要:
          "Active Plan: 重构认证模块
           Goal: 将认证逻辑从 monolith 拆分...
           Progress: 3/5 tasks completed
           - [x] task-1: 创建 auth-service 包结构
           - [x] task-2: 迁移认证逻辑
           - [x] task-3: 编写单元测试
           - [ ] task-4: 更新依赖引用 (NEXT)
           - [ ] task-5: 代码审查
           Use plan_get(detail:'full') for details."
  │
  ▼
Lead Agent 读取摘要 → 继续从 task-4 分发执行
  无需重新加载所有 task body / skill 内容
```

---

## 十、与现有系统的兼容性

### 10.1 向后兼容

| 现有组件 | 变更策略 |
|----------|---------|
| `PlanLoader` (markdown) | **保留**，作为可选输入源；增加 `markdownToPlan()` 转换函数 |
| `PlanRun` | **适配**，`planId` 指向新 `Plan.id`；保持文件格式兼容 |
| `perform_work` tool | **移除**，不再提供该工具；统一使用 `task_delegate(planId+taskId)` 进行计划任务分发 |
| `PlanFileStore` | **保留**作为 markdown plan 的读写后端 |
| `task_delegate` | **增强**，新增 `planId+taskId` 参数，同时保持原有 `prompt+subagent` 模式；Phase A 不重命名为 `task_dispatch` |
| YAML config agents | **保留优先级**，但语义改为“静态 agent profiles”；运行时最终执行 spec 仍在 dispatch 前生成 |
| 当前 `AgentSpec` 类型 | **阶段性兼容**，Phase A 可保留作为兼容壳；中期拆分为 `RegisteredAgentProfile` 与 `AgentSpec` |

### 10.2 迁移路径

```
Phase A (当前 sprint):
  └── 实现 PlanStore (Local) + plan_create/plan_get/plan_list 工具
  + AgentProfile 定义 + TaskType 路由
  + AgentSpecFactory
  + task_delegate 增强 (planId+taskId)
  + 移除 perform_work 工具注册与回调注入

Phase B (下个 sprint):
  └── RemotePlanStore + CompositePlanStore
      + Session 恢复 plan 注入
      + SkillAdapter 完整实现 + skill 注入

Phase C (后续):
  └── 并行任务分发
      + Plan 版本历史
      + Plan 协作/共享
```

---

## 十一、关于第三个问题的结论

### Plan 是否应该参考 Skills？

**不应该直接参考。更合理的层次是：Plan 不持有 `skillRefs`，Skill 由模型在分析 plan/task 后生成 `TaskExecutionSpec.requiredSkills`。**

- Plan 负责描述要做什么：goal、constraints、tasks、dependencies、files
- TaskExecutionSpec 负责描述怎么做：agentProfile、requiredSkills、tool allowlist、model tier
- 实际 skill 内容在 task dispatch 时才加载（惰性），不会污染 plan 定义层
- 这样做的好处：
  - Plan 定义更稳定，适合持久化、恢复与跨端同步
  - skill 选择可以随着代码库状态、工具可用性、模型能力动态调整
  - 同一个 plan task 在不同环境下可以组装出不同 AgentSpec，而无需改写 plan 本身

### AgentSpec 是否应该运行时生成？

**是。更准确地说，静态层应该是 AgentProfile，运行时层才是 AgentSpec。**

- 静态注册表保存的是 profile/defaults，用来表达能力边界与默认偏好
- dispatch 前根据 plan、task、skills、当前可用工具、模型选择策略组装出 AgentSpec
- SessionFactory 与 PromptManager 实际消费的本来就是运行时字段：`model`、`systemPrompt`、`tools`、`maxToolTurns`
- 因此 Vitamin 的最终实现应该是“profile registry + AgentSpecFactory”，而不是“预注册完整 AgentSpec 再硬套到所有任务上”

### 为什么移除 performWork？

结论：**保留单一执行入口更清晰，计划推进交给模型决策。**

- `dispatchTask` 是唯一执行原语（single execution primitive），负责“拿到 AgentSpec 后执行 task 并推进 subagent”。
- `performWork` 从公开接口移除，避免形成第二条计划执行路径。
- 计划级推进（选 next ready task、依赖判断、重排）由 Lead Agent 基于 `plan_get` + `task_delegate` 自主决策。
- review gate 保持在 Dispatcher 单点执行，避免重复审查链路。

统一主路径（LLM 分析 plan -> Dispatcher 执行）：

1. `plan_create`/`plan_update` 维护 plan（只描述 what）
2. Lead Agent 基于 `plan_get` 选择可执行 task
3. 运行时生成/刷新 `TaskExecutionSpec`
4. 组装 `AgentSpec`
5. 调用 `task_delegate`（内部进入 `dispatchTask`）
6. Dispatcher 执行 subagent，并在内部执行 **一次** review gate
7. 回写 task/plan 状态与 checkpoint

职责例子（重构认证模块）：

1. Lead Agent 分析 plan，得到任务序列：`task-1(建目录)` -> `task-2(迁移逻辑)` -> `task-3(补测试)`。
2. Lead Agent 调用 `task_delegate({ planId, taskId: 'task-1' })`。
3. Dispatcher 通过 `dispatchTask` 路由到 `infra` subagent 执行，并返回结果。
4. Lead Agent 更新计划并继续调用下一次 `task_delegate`。

因此最终分层是：

- plan 决策层：Lead Agent
- 执行引擎层：`dispatchTask`

### 是否有渐进披露需要？

**有，且是关键设计约束**。

原因:
1. **Token 效率**: Plan 完整内容可能数千 token，session 恢复时全量注入会浪费上下文窗口
2. **Session 恢复**: 重启/切换 session 后，Lead Agent 只需要知道 plan 摘要 + 当前进度，即可继续编排
3. **Memory 管理**: 已完成 task 的详细输出应归档到 memory/checkpoint，不在活跃上下文中
4. **Skill 加载**: Skill 内容按需注入到当前执行的 subagent，不提前加载

渐进披露层次:
- **L0（自动注入）**: Plan 摘要 → session 恢复时
- **L1（按需注入）**: 当前 task 详情 → dispatch 时
- **L2（惰性加载）**: Skill 内容 → subagent 执行时
- **L3（显式请求）**: 完整 plan + 所有 task body → `plan_get(detail: 'full')`
