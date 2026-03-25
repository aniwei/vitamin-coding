# @vitamin/orchestrator

多 Agent 编排引擎 — 子 Agent 隔离、Plan-Review-Execute 管线、自适应模型分层。

> **技术方案版本**: v2.1 — 基于 [deepagents](https://github.com/langchain-ai/deepagents) 与 [superpowers](https://github.com/obra/superpowers) 的竞品分析重新设计，结合 vitamin 现有架构消除功能重叠。

---

## 1. 竞品分析

### 1.1 deepagents (langchain-ai)

**定位**: Python/LangGraph 上的 "Agent Harness"（电池全含型编程框架）。

**核心架构**:

| 能力 | 实现方式 | 设计亮点 |
|------|----------|----------|
| 中间件管线 | `AgentMiddleware` 抽象 — `TodoListMiddleware`, `FilesystemMiddleware`, `SubAgentMiddleware`, `SummarizationMiddleware` 等 | 可组合、热插拔；`before_agent` / `after_agent` 钩子 |
| 子 Agent 委派 | 内置 `task` 工具 → 创建临时 Agent 实例，独立上下文执行 → 返回单条最终报告 | 上下文隔离 + token 高效；子 Agent 无状态、一次性 |
| 规划 | `write_todos` 工具维护结构化任务列表 (pending / in_progress / completed) | 持久化于 Agent state，跨步骤追踪 |
| 上下文工程 | 四层：输入上下文 → 压缩（摘要/offload） → 隔离（子 Agent） → 持久记忆 | 自动摘要 middleware 在任务间隙触发 |
| 虚拟文件系统 | 可插拔 Backend: `StateBackend`, `FilesystemBackend`, `StoreBackend`, `CompositeBackend` | ls/read/write/edit/glob/grep/execute 统一接口 |
| 技能系统 | SKILL.md + 渐进式披露（启动时读 frontmatter，按需加载完整内容） | 减少启动 token |

**可采纳点**:
- 子 Agent 上下文隔离模式
- 渐进式披露降低启动开销

### 1.2 superpowers (obra)

**定位**: **方法论 + 技能包**，而非编程框架。

**关键理解 — superpowers 的子 Agent 是如何创建的**:

superpowers **不包含任何编排代码**。它是一组 SKILL.md 文本指令，依附于宿主平台（Claude Code / Cursor / Codex）运行：

```
宿主平台 (Claude Code / Cursor / Codex)
    └─ 平台内置 Task 工具（子 Agent 能力由平台提供）
         └─ superpowers SKILL.md（方法论指令，纯文本）
              └─ 指导 LLM 如何使用平台 Task 工具调度子 Agent
```

- **Lead Agent = LLM 本身**。读取 SKILL.md 指令后，LLM 自主决定使用平台 `Task` 工具
- **子 Agent 也是 LLM**。主 Agent 通过 `Task` 工具发送 prompt template，子 Agent 按 prompt 执行
- **所有编排逻辑编码在文本指令中**，由 LLM 解读执行，而非编程逻辑控制
- **无类型安全、无确定性保证** — 完全依赖 LLM 遵循指令的能力

**工作流**:

```
brainstorming → writing-plans → subagent-driven-development → code-review → finishing-branch
     ↓               ↓                    ↓                       ↓              ↓
  需求理解        计划生成          子Agent逐任务执行+双阶段审查    全局审查         收尾
```

**核心设计模式** (值得采纳的方法论):

| 模式 | 核心思想 |
|------|----------|
| 两阶段审查 | spec compliance → code quality，顺序不可颠倒 |
| 实现者状态协议 | DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED — 结构化反馈 |
| 上下文精确构造 | 子 Agent 不继承父 Agent 历史，主 Agent 精确构造全部所需信息 |
| 自适应模型选择 | 机械任务 → 便宜模型；集成 → 标准；架构/审查 → 最强 |
| 零占位符计划 | 每步含精确文件路径 + 完整代码 + 测试命令 + 预期输出 |

### 1.3 vitamin vs 竞品：定位差异

| 维度 | deepagents | superpowers | vitamin |
|------|------------|-------------|---------|
| 实现语言 | Python | 无代码（纯 SKILL.md 文本） | TypeScript |
| 子 Agent 控制 | LLM 通过 `task` 工具 | LLM 通过平台 `Task` 工具 | **程序化调度** (TaskDispatcher) |
| 编排保证 | LLM 判断 + 中间件拦截 | 零保证（依赖 LLM 遵循指令） | **类型安全 + 确定性流程** |
| 审查机制 | 无内置 | LLM 自主审查（可能跳过） | **程序强制门禁** |
| 适用场景 | Python 生态 + LangGraph | 任意支持 Task 工具的平台 | 自研 Agent 产品 |

**vitamin 的核心优势**：superpowers 的方法论，但由**程序逻辑强制执行**而非依赖 LLM 遵循指令。

### 1.4 vitamin 现有能力 vs v2 目标

| 维度 | v1 现状 | v2 目标 | 改动性质 |
|------|---------|---------|----------|
| 子 Agent 隔离 | 无（共享上下文） | 上下文精确构造 + 隔离 | **新增** |
| 审查质量门 | Momus 单次计划审查 | Momus 增强：计划审查 + 实现审查(两阶段) | **增强** |
| 模型分层 | 固定 priority 列表 | 自适应模型选择器 | **增强** |
| 规划质量 | Prometheus 生成 | + 自审循环 + 零占位符检查 | **增强** |
| 上下文管理 | Session compact + MemoryManager | 统一编排（见§3 去重） | **重构** |
| DAG 并行 | ✅ Atlas | + 问题域分组 + 冲突检测 | **增强** |

---

## 2. 功能去重分析

### 2.1 已识别重叠

在引入新能力前，必须厘清 vitamin 现有包之间的职责边界。

#### 重叠 1：上下文管理三重冲突 (🔴 严重)

```
@vitamin/session                 @vitamin/memory                  v1 方案 ContextMiddleware
├─ Session.compact()             ├─ MemoryManager.compact()       ├─ "自动压缩"
├─ Session.buildContext()        ├─ MemoryManager.needsCompaction()├─ "Token 预算"
└─ 消息追加 + 边界标记           └─ L1/L2/L3 三层记忆             └─ "四层上下文工程"
                                                                    ↑
                                                                  与前两者重叠
```

**问题**：三个系统都能触发压缩、都能构建上下文、无明确所有权。

**v2.1 解决方案**：**不新增 ContextMiddleware**。改为明确各层职责：

| 系统 | 唯一职责 | 不做 |
|------|---------|------|
| `Session` | 消息存储 + 追加 + 边界标记 + `buildContext()` 返回原始数据 | 不决定何时压缩 |
| `MemoryManager` | 压缩算法 (L2 Prune/Compaction) + L1 记忆加载 + L3 归档 | 不决定何时压缩 |
| `@vitamin/coding` (AgentSession) | **编排层** — 调用 `MemoryManager.needsCompaction()` → 触发 `MemoryManager.compact()` → 写回 `Session.compact()` | — |

层级关系：`AgentSession` 编排 → `MemoryManager` 算法 → `Session` 存储。不新增 ContextMiddleware。

#### 重叠 2：Middleware vs Hooks (🟡 中等)

```
@vitamin/hooks HookRegistry           v1 方案 OrchestratorMiddleware
├─ tool.execute.before/after          ├─ beforeToolCall/afterToolCall
├─ chat.message.before/after          ├─ beforeAgent/afterAgent
├─ messages.transform                 ├─ MiddlewareContext 修改
└─ 18 种钩子（emit 风格）            └─ 链式拦截
```

**问题**：工具拦截、消息转换存在功能重复。

**v2.1 解决方案**：**不新增独立 Middleware Pipeline**。利用现有 `@vitamin/hooks` 的 HookRegistry：

| 层级 | 机制 | 用途 |
|------|------|------|
| **Dispatcher 层** | HookRegistry（已有） | 全局守卫：日志、监控、工具审批 |
| **Agent.run 层** | Agent 事件系统（已有） | Agent 级：token 追踪、流式输出 |
| **Workflow 层** | Plan Pipeline 步骤间逻辑（已有） | 流程控制：审查门禁、状态检查 |

新增能力（子 Agent 隔离、两阶段审查、模型选择）通过**增强现有层**实现，而非新建中间件层。

#### 重叠 3：审查（Momus vs ReviewGateMiddleware）(🟢 轻微 — 补充关系)

| | Momus (已有) | v1 方案 ReviewGateMiddleware |
|--|-------------|------------------------------|
| 审查对象 | **计划** | **实现** |
| 审查标准 | 完整性、可行性、依赖、风险、范围 | spec 合规、代码质量 |
| 阶段 | Plan Pipeline Step 3 | 执行后 |

**v2.1 解决方案**：不新增 ReviewGateMiddleware。**增强 Momus Agent** 支持两种审查模式：

```typescript
type MomusMode = 'plan-review' | 'spec-review' | 'quality-review'
```

同一个 Agent，不同 prompt 模板，复用审查基础设施。

### 2.2 去重后的架构变动

| v1 方案 | v2.1 调整 | 原因 |
|---------|-----------|------|
| ~~ContextMiddleware~~ | ❌ 删除 | 与 Session + MemoryManager 重叠；由 AgentSession 编排 |
| ~~Middleware Pipeline~~ | ❌ 删除 | 与 HookRegistry 重叠；新增能力通过增强现有层实现 |
| ~~ToolInterceptionMiddleware~~ | ❌ 删除 | 已有 `tool.execute.before/after` 钩子 |
| ~~PlanningMiddleware~~ | ❌ 删除 | Plan Pipeline 已有 TodoList 追踪 |
| ~~ReviewGateMiddleware~~ | ❌ 删除 | 增强 Momus Agent 支持多模式审查 |
| ~~SubAgentMiddleware~~ | → **SubAgentDispatcher** | 不是中间件，是 TaskDispatcher 的子 Agent 调度增强 |

---

## 3. 架构总览（v2.1 去重后）

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        @vitamin/orchestrator                           │
│                                                                        │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    Layer 3: Workflow Engine                      │   │
│  │  Plan Pipeline · Subagent-Driven Execution · Quality Gates      │   │
│  └──────────────────────────┬──────────────────────────────────────┘   │
│                             │                                          │
│  ┌──────────────────────────▼──────────────────────────────────────┐   │
│  │                    Layer 2: Orchestration Core                   │   │
│  │  AgentRegistry · TaskDispatcher · CategoryResolver · Background │   │
│  │  SubAgentDispatcher · ModelTierSelector                         │   │
│  └──────────────────────────┬──────────────────────────────────────┘   │
│                             │                                          │
│  ┌──────────────────────────▼──────────────────────────────────────┐   │
│  │                    Layer 1: Agent Harness                       │   │
│  │  wrapAgent · AgentInstance · Event Stream                       │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                        │
│  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ 依赖的其他包 ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─    │
│  @vitamin/hooks (HookRegistry)    — Dispatcher 层全局守卫             │
│  @vitamin/session (Session)       — 消息存储                          │
│  @vitamin/memory (MemoryManager)  — 压缩算法 + 持久记忆               │
│  @vitamin/coding (AgentSession)   — 上下文编排                        │
│                                                                        │
└─────────────────────────────────────────────────────────────────────────┘
```

三层 + 外部包协作（非四层 — 删除了 Middleware Pipeline 层）：

1. **Agent Harness** — Agent 实例化、适配接口（已有）
2. **Orchestration Core** — 注册表、路由、调度 + **新增** SubAgentDispatcher、ModelTierSelector
3. **Workflow Engine** — Plan 管线 + **新增** 子 Agent 驱动执行、两阶段审查

上下文管理由 `@vitamin/coding` (AgentSession) 编排 `@vitamin/session` + `@vitamin/memory`，不在 orchestrator 内重复。

---

## 4. Layer 1: Agent Harness

### 4.1 wrapAgent 适配器

所有 Agent 工厂遵循统一模式：

```typescript
import { createAgentWithRegistry as createAgent } from '@vitamin/agent'
import { wrapAgent } from './agent-adapter'

export function createOracleAgent(model, tools, options?): AgentInstance {
  const agent = createAgent({ model, providerRegistry: options?.providerRegistry })
  return wrapAgent(agent, { model, systemPrompt: ORACLE_PROMPT, tools, maxToolTurns: 30 })
}
```

`wrapAgent` 将 `@vitamin/agent` 的无状态 `Agent` 包装为 `AgentInstance` 接口：

```typescript
interface AgentInstance {
  prompt(message: string): Promise<AgentResult>
  abort(): void
  on(listener: AgentEventListener): void
}
```

每次 `prompt()` 都传入完整运行时配置（model, systemPrompt, tools, messages）— Agent 本身无状态。

---

## 5. Layer 2: Orchestration Core

### 5.1 Agent 注册表（已有）

```typescript
const registry = createAgentRegistry()

registry.register({
  name: 'hephaestus',
  factory: createHephaestusAgent,
  mode: 'subagent',
  metadata: {
    category: 'specialist',
    cost: 'MODERATE',
    triggers: [{ domain: 'code', trigger: 'write/modify code' }],
    executionMode: 'sync',
  },
  modelPriority: ['claude-sonnet-4-20250514', 'gpt-4o'],
  disableable: true,
  enabled: true,
})
```

### 5.2 专家 Agent 矩阵

| Agent | 角色 | 模型档位 | 执行模式 |
|-------|------|----------|----------|
| `central-secretariat` | 中央调度：意图识别 → 需求拆解 → 任务编排 | capable | primary |
| `hephaestus` | 代码生成与修改 | standard/fast | subagent |
| `explore` | 代码库探索与搜索 | fast | subagent |
| `oracle` | 架构战略顾问 | capable | subagent |
| `librarian` | 知识检索与文档 | fast | subagent |
| `sisyphus-junior` | 重复性/机械性任务 | fast | subagent |
| `metis` | 访谈式需求收集 | capable | subagent |
| `momus` | 审查（计划审查 / spec 审查 / 质量审查） | capable | subagent |
| `multimodal-looker` | 多模态分析 | standard | subagent |
| `prometheus` | 计划生成 | capable | subagent |
| `atlas` | DAG 并行执行 | standard | subagent |

### 5.3 任务调度器（已有）

双路径调度：

```
TaskRequest
    ├─ 路径 A: request.subagent 指定 → 直接查找注册表
    └─ 路径 B: request.category 指定 → CategoryResolver 映射 → 查找注册表
```

### 5.4 自适应模型选择器（新增）

借鉴 superpowers 的模型分层策略，增强 TaskDispatcher 的 `resolveModel`：

```typescript
type ModelTier = 'fast' | 'standard' | 'capable'

interface ModelTierConfig {
  fast: Model       // 机械任务：单文件改动、清晰 spec、1-2 个文件
  standard: Model   // 集成任务：多文件协调、模式匹配、调试
  capable: Model    // 架构/设计/审查：需要广泛代码库理解
}

interface TaskComplexitySignals {
  fileCount: number
  hasIntegrationConcerns: boolean
  requiresDesignJudgment: boolean
  isReviewTask: boolean
}

// 集成到 TaskDispatcher，而非独立系统
const dispatcher = createTaskDispatcher({
  resolveModel: (registration, request) => {
    const tier = inferModelTier(registration, request)
    return tierConfig[tier]
  },
})
```

### 5.5 SubAgentDispatcher（新增）

子 Agent 调度增强 — 集成到 TaskDispatcher 内部，而非独立中间件。

核心原则：**子 Agent 不继承父 Agent 的会话历史**。由调度方精确构造全部所需信息。

```typescript
interface SubAgentContext {
  taskDescription: string         // 完整任务描述（从计划中提取全文）
  relevantFiles: FileContent[]    // 相关文件内容（调度方预读）
  sceneContext: string            // 场景上下文：任务在整体计划中的位置
  constraints: string[]           // 约束条件
  expectedOutput: string          // 期望输出格式
}

// TaskDispatcher 内部增强
class TaskDispatcher {
  async dispatchSubAgent(
    context: SubAgentContext,
    registration: AgentRegistration,
  ): Promise<TaskHandle> {
    // 1. 根据任务复杂度选择模型档位
    const tier = inferModelTier(registration, context)
    const model = this.tierConfig[tier]
    
    // 2. 构造隔离的 prompt（不传父 Agent 历史）
    const prompt = buildIsolatedPrompt(context)
    
    // 3. 创建 Agent 实例并执行
    const agent = registration.factory(model, tools, options)
    return this.executeAgent(agent, prompt)
  }
}
```

**与 deepagents / superpowers 的区别**:
- deepagents: LLM 通过 `task` 工具触发，由 middleware 创建子 Agent → **LLM 驱动**
- superpowers: LLM 通过平台 `Task` 工具触发，由平台创建子 Agent → **LLM 驱动**
- vitamin: **TaskDispatcher 程序化调度** → Plan Pipeline 流程代码决定何时创建子 Agent → **确定性控制**

---

## 6. Layer 3: Workflow Engine

### 6.1 子 Agent 驱动执行（新增）

superpowers 的 subagent-driven-development 模式，由**程序逻辑强制执行**：

```
┌──────────────────────────────────────────────────────┐
│              Plan Pipeline (程序控制流)                │
│                                                        │
│  读取计划 → 提取所有任务 → 创建 TodoList               │
│       │                                                │
│       ▼                                                │
│  ┌─────────── Per Task Loop ───────────┐              │
│  │                                      │              │
│  │  1. 构造精确上下文（不传 raw history）  │              │
│  │       │                              │              │
│  │       ▼                              │              │
│  │  2. dispatcher.dispatchSubAgent()    │              │
│  │       │                              │              │
│  │       ▼                              │              │
│  │  3. 解析 ImplementerResult           │              │
│  │     DONE → 审查                      │              │
│  │     NEEDS_CONTEXT → 补充 → 重派      │              │
│  │     BLOCKED → 升级模型或拆分          │              │
│  │       │                              │              │
│  │       ▼                              │              │
│  │  4. dispatcher.dispatch(momus,       │              │
│  │       mode='spec-review')            │              │
│  │     ✅ → 5  │  ❌ → 修复 → 重审     │              │
│  │       │                              │              │
│  │       ▼                              │              │
│  │  5. dispatcher.dispatch(momus,       │              │
│  │       mode='quality-review')         │              │
│  │     ✅ → 完成  │  ❌ → 修复 → 重审  │              │
│  │                                      │              │
│  └──────────────────────────────────────┘              │
│       │                                                │
│       ▼                                                │
│  终审：dispatcher.dispatch(momus,                       │
│        mode='quality-review', scope='全局')             │
│       │                                                │
│       ▼                                                │
│  dispatcher.dispatch(oracle, mode='verify')            │
└──────────────────────────────────────────────────────┘
```

关键区别：每个「审查 → 修复 → 重审」循环是**程序 while 循环**，不是 LLM 自主决策。

#### 实现者状态协议（新增）

```typescript
type ImplementerStatus = 'DONE' | 'DONE_WITH_CONCERNS' | 'NEEDS_CONTEXT' | 'BLOCKED'

interface ImplementerResult {
  status: ImplementerStatus
  output: string
  concerns?: string[]      // DONE_WITH_CONCERNS 时的疑虑
  contextNeeded?: string[] // NEEDS_CONTEXT 时需要的信息
  blockReason?: string     // BLOCKED 时的阻塞原因
}
```

程序化处理策略（非 LLM 判断）：
- **DONE** → 程序直接进入 spec 审查步骤
- **DONE_WITH_CONCERNS** → 程序检查 concerns 是否含 `correctness` / `scope` 关键词 → 有则修复再审，无则继续
- **NEEDS_CONTEXT** → 程序收集 `contextNeeded` 列出的文件/信息 → 同模型重新派遣
- **BLOCKED** → 程序按三步升级：(1) 补上下文 (2) 升级模型档位 (3) 拆分为子任务

### 6.2 Momus 增强：多模式审查（增强已有 Agent）

不新增 ReviewGateMiddleware，而是增强现有 Momus Agent 支持三种审查模式：

```typescript
type MomusMode = 'plan-review' | 'spec-review' | 'quality-review'

// Plan Pipeline 通过 request.metadata 传递模式
await dispatcher.dispatch({
  subagent: 'momus',
  prompt: reviewContent,
  metadata: { momusMode: 'spec-review', taskSpec: originalSpec },
})
```

| 模式 | 审查对象 | 标准 | 触发时机 |
|------|---------|------|----------|
| `plan-review` (已有) | 计划文档 | 完整性、可行性、依赖、风险 | Prometheus 生成后 |
| `spec-review` (新增) | 实现代码 vs 规范 | 需求覆盖、无多余功能、行为匹配 | 每任务实现后 |
| `quality-review` (新增) | 实现代码 | 代码风格、测试覆盖、错误处理、性能 | spec 审查通过后 |

审查顺序由 Plan Pipeline 程序强制：**必须 spec-review ✅ 后才执行 quality-review**。

### 6.3 Plan-Review-Execute 管线（增强）

在现有 6 步管线基础上升级：

```
Metis(预分析) → Prometheus(生成计划+自审) → Momus(plan-review) 
     → [SubAgent 逐任务执行 + spec-review + quality-review per task]
     → Momus(全局 quality-review) → Oracle(验证)
```

**v1 vs v2.1 对比**:

| 阶段 | v1 | v2.1 |
|------|----|----|
| 计划生成 | Prometheus 直出 | Prometheus + 自审循环 + 零占位符检查 |
| 计划审查 | Momus 单次 | Momus plan-review 多轮 |
| 执行方式 | Atlas DAG 统一调度 | SubAgent 逐任务 + 两阶段审查 (程序强制) |
| 失败处理 | Hephaestus 修复 | 实现者状态协议 + 自适应模型升级 |
| 终审 | Oracle 验证 | Momus 全局 quality-review + Oracle 验证 |

### 6.4 并行 Agent 调度（增强）

增强现有 DAG 执行器，借鉴 superpowers 的 dispatching-parallel-agents 模式：

```typescript
interface ParallelDispatchOptions {
  taskGroups: TaskGroup[]
  maxConcurrency: number
  conflictDetection: boolean  // 执行后验证 Agent 是否编辑了相同文件
}

interface TaskGroup {
  domain: string           // 问题域标识
  tasks: TaskRequest[]
  isolationLevel: 'full' | 'shared-read'
}
```

调度流程（程序控制，非 LLM 决策）：
1. 分析任务依赖图 → DAG 拓扑排序（已有 `buildDag`）
2. 无依赖任务分组并发执行（已有 `getReadyNodes`）
3. **新增**：执行后冲突检测（文件级别）
4. **新增**：冲突任务串行重执行

---

## 7. 动态 Prompt 系统（已有）

根据注册表中的 Agent 元数据动态构建系统提示词：

```typescript
const dynamicPrompt = buildDynamicPrompt({
  agents: registry.getAll(),
  currentContext: { ... },
})
```

---

## 8. 包间职责边界

为防止功能重叠，明确各包的唯一职责：

```
@vitamin/agent       — Agent.run() 执行引擎。不知道注册表、调度、Plan。
@vitamin/session     — 消息存储 + 压缩边界标记。不决定何时压缩。
@vitamin/memory      — 压缩算法 (L1/L2/L3) + 持久记忆。不决定何时压缩。
@vitamin/hooks       — Dispatcher 层全局守卫。不做 Agent 级别拦截。
@vitamin/coding      — AgentSession 编排层：调度 Agent + 驱动 Session/Memory + 配置模型。
@vitamin/orchestrator — 多 Agent 编排：注册表 + 路由 + 调度 + Plan Pipeline + 子Agent隔离。
```

关键原则：
- **Session** 只管存储，**MemoryManager** 只管算法，**AgentSession** 决定时机
- **HookRegistry** 在 Dispatcher 层做全局守卫，**Agent 事件** 在 Agent.run 层做追踪
- **Momus** 一个 Agent 三种模式，不为每种审查创建独立系统
- **SubAgent 隔离** 是 TaskDispatcher 的调度增强，不是独立中间件层

---

## 9. Installation

```bash
pnpm add @vitamin/orchestrator
```

## 10. Usage

```typescript
import {
  createAgentRegistry,
  createTaskDispatcher,
  createCategoryResolver,
  createBackgroundManager,
  createCentralSecretariatAgent,
  createHephaestusAgent,
} from '@vitamin/orchestrator'

// 1. 创建注册表并注册 Agent
const registry = createAgentRegistry()
registry.register({
  name: 'central-secretariat',
  factory: createCentralSecretariatAgent,
  mode: 'primary',
  metadata: { category: 'orchestrator', cost: 'EXPENSIVE', triggers: [], executionMode: 'sync' },
  modelPriority: ['claude-sonnet-4-20250514'],
  disableable: false,
  enabled: true,
})

// 2. 创建调度器（含模型分层）
const dispatcher = createTaskDispatcher({
  registry,
  categoryResolver: createCategoryResolver(),
  backgroundManager: createBackgroundManager(),
  resolveModel: (reg, request) => {
    const tier = inferModelTier(reg, request)
    return tierConfig[tier]
  },
  resolveTools: (reg) => tools,
})

// 3. 调度任务
const handle = await dispatcher.dispatch({
  category: 'code',
  prompt: 'Refactor the auth module',
})

// 4. 执行完整 Plan Pipeline（含子 Agent 驱动执行 + 两阶段审查）
import { executePlanPipeline, createPlanStorage } from '@vitamin/orchestrator'

const result = await executePlanPipeline('Build a new auth system', {
  dispatcher,
  storage: createPlanStorage(),
  maxRevisions: 2,
  executeAfterApproval: true,
})
```

## 11. Key Exports

| Export | Description |
|--------|-------------|
| `AgentRegistry`, `createAgentRegistry` | Agent 注册与查找 |
| `CategoryResolver`, `createCategoryResolver` | 类别路由映射 |
| `TaskDispatcher`, `createTaskDispatcher` | 双路径任务调度 + 子 Agent 隔离调度 |
| `BackgroundManager`, `createBackgroundManager` | 后台任务管理 |
| `executeSyncTask` | 同步任务执行 |
| `wrapAgent`, `extractTextContent` | Agent → AgentInstance 适配 |
| `executePlanPipeline`, `executePlan` | Plan-Review-Execute 管线 |
| `createPlanStorage` | 计划持久化 |
| `buildDag`, `getReadyNodes`, `isDagFinished` | DAG 构建与遍历 |
| `buildDynamicPrompt`, `buildDelegationTable` | 动态 Prompt 构建 |

### Agent 工厂 (11)

| Agent | 角色 | 模型档位 |
|-------|------|----------|
| `createCentralSecretariatAgent` | 中央调度（意图识别 + 需求拆解） | capable |
| `createHephaestusAgent` | 代码生成与修改 | standard/fast |
| `createExploreAgent` | 代码库探索与搜索 | fast |
| `createOracleAgent` | 架构战略顾问 | capable |
| `createLibrarianAgent` | 知识检索与文档 | fast |
| `createSisyphusJuniorAgent` | 重复性/机械性任务 | fast |
| `createMetisAgent` | 访谈式需求收集 | capable |
| `createMomusAgent` | 多模式审查（plan / spec / quality） | capable |
| `createMultimodalLookerAgent` | 多模态分析 | standard |
| `createPrometheusAgent` | 计划生成（零占位符标准） | capable |
| `createAtlasAgent` | DAG 并行执行 | standard |

## 12. Types

```typescript
// Agent 注册 (已有)
AgentMode, AgentCategory, AgentCost, AgentPromptMetadata,
AgentFactory, AgentFactoryOptions, AgentInstance, AgentResult, AgentRegistration

// 任务调度 (已有)
TaskRequest, TaskStatus, TaskHandle, Dispatcher

// Plan 管线 (已有)
Plan, PlanStep, DagNode, DagNodeStatus, DagExecutionResult,
PipelineState, PipelinePhase, PipelineResult, PipelineOptions,
PlanStorage, PlanFamilyAgent

// 需求收集 (已有)
InterviewState, InterviewQuestion

// 审查 (增强)
MomusReviewResult, MomusMode

// 新增类型
ModelTier, ModelTierConfig, TaskComplexitySignals,     // 模型分层
ImplementerStatus, ImplementerResult, SubAgentContext,  // 子 Agent 驱动执行
ReviewResult, ReviewIssue,                              // 结构化审查
ParallelDispatchOptions, TaskGroup                      // 并行调度增强
```

## 13. 实施路线

| 阶段 | 内容 | 改动范围 |
|------|------|----------|
| **Phase 0** (已完成) | Agent 注册表、类别路由、任务调度、Plan 管线、DAG 执行器 | — |
| **Phase 1** | SubAgentDispatcher + 上下文构造器 + 实现者状态协议 | `TaskDispatcher` 增强 |
| **Phase 2** | Momus 多模式审查 (plan / spec / quality) | `momus.ts` 增强 |
| **Phase 3** | Plan Pipeline 升级（子 Agent 逐任务执行 + 两阶段审查循环） | `plan-pipeline.ts` 重写 |
| **Phase 4** | ModelTierSelector（自适应模型选择） | `TaskDispatcher.resolveModel` 增强 |
| **Phase 5** | 并行调度增强（冲突检测 + 域分组） | `plan-executor.ts` 增强 |
| **Phase 6** | AgentSession 上下文编排统一（明确 Session/MemoryManager 边界） | `@vitamin/coding` 重构 |

## License

See [root README](../../README.md) for details.
