# @vitamin/orchestrator — 多 Agent 编排层技术方案

> **综合分析** [obra/superpowers](https://github.com/obra/superpowers) (v5.0.6, 113k★) 与 [langchain-ai/deepagents](https://github.com/langchain-ai/deepagents) (v0.5.0, 17.5k★) 的编排设计，结合 vitamin 当前实现，形成统一的多 Agent 调度内核方案。

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
15. [API 草案(TypeScript)](#15-api-草案typescript)
16. [设计取舍](#16-设计取舍)

---

## 1. 背景与动机

vitamin 生态中编排相关能力已分散在多个包中，但缺少统一调度内核：

| 包 | 已有能力 | 缺口 |
|---|---------|------|
| `@vitamin/agent` | 单 Agent work loop、15 种生命周期事件、断点调试 | 无多 Agent 协调能力 |
| `@vitamin/tools` | 9 个编排工具接口(task_delegate/agent_call/perform_work/task_CRUD/background_*) | 回调实现全部为空桩 |
| `@vitamin/hooks` | 28 个内置 Hook(stream/compaction/background/tool_error/token_budget) | 无编排级 Hook |
| `@vitamin/coding` | CodingSessionManager 多会话管理、持久化、Fork | 无跨会话编排 |
| `@vitamin/cli` | 已声明依赖 `AgentRegistry`, `Dispatcher`, `BackgroundManager` | 类型不存在 |

**核心问题**: `@vitamin/tools` 的 `RegisterBuiltinOptions` 要求注入 `dispatchTask`/`performWork`/`callAgent` 等回调，但目前无任何包提供这些回调的实现。`@vitamin/cli` 的 `Subsystems` 接口已声明了 `AgentRegistry`/`Dispatcher`/`BackgroundManager` 三个类型依赖。`@vitamin/orchestrator` 必须填补这个空白。

---

## 2. 外部方案深度分析

### 2.1 superpowers — 流程编排范式

superpowers 是一个面向 coding agent 的 skills 框架，核心价值在于**严格的软件开发流程编排**而非运行时 API。

#### 2.1.1 完整工作流

superpowers 定义了 7 个强制阶段，每个阶段由独立 Skill 控制：

```
brainstorming → using-git-worktrees → writing-plans
    → subagent-driven-development / executing-plans
    → requesting-code-review → finishing-a-development-branch
```

关键设计特征：

1. **Brainstorming as Hard Gate** — 所有项目（无论多简单）必须经过设计阶段。checklist 强制执行：探索上下文 → 澄清问题(一次一个) → 提出 2-3 方案 → 分段呈现设计 → 写 spec → self-review → 用户审批。设计文档 commit 到 `docs/superpowers/specs/`。

2. **Plan as Contract** — `writing-plans` 将 spec 分解为 bite-sized tasks (每步 2-5 分钟)。每步包含**完整可执行代码**、精确文件路径、验证命令、预期输出。计划是下游执行的唯一输入，不允许占位符。计划写完后有 self-review 检查 spec 覆盖度、占位符扫描、类型一致性。

3. **Subagent-Driven Development (核心)** — 每个任务分配独立 subagent：

   ```
   Per Task:
     Dispatch Implementer → (questions? → answer → re-dispatch)
       → Implementer implements + tests + commits + self-reviews
       → Dispatch Spec Reviewer (spec compliance)
         → (issues? → Implementer fixes → re-review)
       → Dispatch Code Quality Reviewer
         → (issues? → Implementer fixes → re-review)
       → Mark task complete
   After all tasks:
     → Final code reviewer → finishing-a-development-branch
   ```

   关键约束：
   - **Spec review 必须先于 code quality review** — 顺序不可逆
   - **Review loop**: Reviewer 发现问题 → Implementer 修复 → re-review，循环直到 approved
   - **Implementer 四种状态**: DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED
   - **BLOCKED 升级策略**: 补上下文 → 换更强模型 → 拆分任务 → 上报人工
   - **禁止并行 implementation subagents** — 防冲突

4. **Model 分层选择** — 按任务复杂度选用不同模型：
   - 机械实现(1-2 文件、清晰 spec) → 便宜模型
   - 集成任务(多文件协调) → 标准模型
   - 架构/设计/审查 → 最强模型

5. **Parallel Agent Dispatch** — 独立于 subagent-driven-development，用于 3+ 个无共享状态的独立问题域（如多个测试文件失败）。每个 agent 获得：限定范围、明确目标、约束条件、期望输出格式。

#### 2.1.2 可迁移到 vitamin 的设计要素

| 要素 | superpowers 实现 | vitamin 迁移方案 |
|------|-----------------|-----------------|
| Plan as Contract | Skill 约定 + markdown 文件 | `PlanEngine` 解析结构化计划 |
| Two-stage Review | Spec reviewer → Code quality reviewer | `ReviewGate` 组件 + 检查器链 |
| Implementer Status | DONE/NEEDS_CONTEXT/BLOCKED/CONCERNS | `SubagentResult.status` 枚举 |
| Model Tiering | Skill 文档约定 | `AgentRegistry` 中 agent 按能力/成本标签路由 |
| Context Isolation | "subagents should never inherit your session's context" | 子 agent 使用独立 `AgentRunContext` |
| No-parallel-impl | Skill 约定禁止 | `Dispatcher` 的并发策略控制 |

### 2.2 deepagents — 运行时编排范式

deepagents 是一个基于 LangGraph 的 agent harness，核心价值在于**运行时编排能力**和**中间件栈设计**。

#### 2.2.1 架构核心

```
create_deep_agent() → CompiledStateGraph
  ├── Middleware Stack (有序):
  │   ├── TodoListMiddleware        — write_todos 进度追踪
  │   ├── SkillsMiddleware          — 技能加载
  │   ├── FilesystemMiddleware      — 文件操作后端
  │   ├── SubAgentMiddleware        — task 工具 + 子代理管理
  │   ├── SummarizationMiddleware   — 自动上下文压缩
  │   ├── PatchToolCallsMiddleware  — 工具调用修补
  │   ├── AnthropicPromptCachingMiddleware
  │   └── MemoryMiddleware          — 持久记忆
  ├── Built-in Tools:
  │   ├── write_todos, read_file, write_file, edit_file
  │   ├── ls, glob, grep, execute
  │   └── task (子代理启动器)
  └── Checkpointer / Store (LangGraph 原生)
```

#### 2.2.2 子代理系统 (SubAgentMiddleware)

deepagents 的 `task` 工具是子代理调用的统一入口：

```python
# 子代理三种形态
SubAgent         — 声明式: name + description + system_prompt + tools + model
CompiledSubAgent — 预编译: name + description + runnable (自定义 LangGraph 图)
AsyncSubAgent    — 远程异步: name + description + graph_id + url (LangSmith 部署)
```

核心设计：

1. **上下文隔离** — 子代理状态从父状态构建，但排除 `messages`/`todos`/`skills_metadata`/`memory_contents`/`structured_response`。子代理收到的是全新的 `HumanMessage(content=description)`，不继承对话历史。

2. **结果回传** — 子代理返回的最后一条消息被提取为 `ToolMessage` 回传给父 agent。中间推理步骤不可见（"if you only care about the output, not intermediate steps"）。

3. **General-purpose 默认子代理** — 如果用户没有提供同名子代理，自动注入一个具有全部工具的 general-purpose subagent。

4. **并行调用** — 主 agent 可在单条消息中发起多个 `task` tool_call，子代理并行执行。

5. **使用场景判断**:
   - ✅ 复杂多步任务、独立可并行、需要隔离上下文和 token、只关心最终结果
   - ❌ 需要看中间推理步骤、任务太简单（几个工具调用即可）、拆分反而增加延迟

#### 2.2.3 Summarization 系统

deepagents 的 `SummarizationMiddleware` 是最精密的组件之一：

1. **自动触发** — 基于 token 使用量(fraction 或绝对值)自动检测是否需要摘要。default: 当达到模型 max_input_tokens 85% 时触发，保留最近 10%。

2. **大参数截断** — 在全量摘要之前，首先截断旧消息中 `write_file`/`edit_file` 的大参数（仅保留前 20 字符 + "...(truncated)"）。

3. **历史外置** — 被摘要的消息持久化到 `/conversation_history/{thread_id}.md`，每次摘要追加一个带时间戳的 section。摘要消息包含文件路径引用："The full conversation history has been saved to {file_path}"。

4. **`compact_conversation` 工具** — 允许 agent 主动触发压缩（eligibility gate: 须达到自动触发阈值的 50%）。

5. **ContextOverflowError 回退** — 即使未达到阈值，如果模型调用抛出 ContextOverflowError，自动回退到摘要路径。

6. **状态追踪** — `_summarization_event` 记录 `cutoff_index + summary_message + file_path`，支持链式摘要且不重复存储。

#### 2.2.4 可迁移到 vitamin 的设计要素

| 要素 | deepagents 实现 | vitamin 迁移方案 |
|------|---------------|-----------------|
| Middleware Stack | `AgentMiddleware` 链式 `wrap_model_call` | vitamin 已有 `HookRegistry`，可扩展编排级 Hook |
| SubAgent Context Isolation | 排除父状态关键字段，传入单条 HumanMessage | orchestrator 构建隔离 `AgentRunContext` |
| Result Summarization | 仅返回最后一条消息的 text | `SubagentResult.output` 为摘要文本 |
| Auto-Summarization | `SummarizationMiddleware` 85%/10% threshold | vitamin `transformContext` 回调 |
| History Offload | 持久化到 `/conversation_history/` | vitamin session 持久化已有，扩展历史外置 |
| compact_conversation Tool | 手动触发压缩 | 可作为 orchestrator 工具暴露 |
| General-purpose Subagent | 自动注入默认子代理 | AgentRegistry 提供 fallback agent |
| Checkpointer | LangGraph 原生 checkpoint | `CheckpointStore` 接口 |

---

## 3. vitamin 当前基线

### 3.1 已有能力详情

**Agent Work Loop** (`@vitamin/agent`)
- `workLoop()` 管理 streaming + tool execution 循环
- 15 种 `AgentEvent` 覆盖全生命周期
- `transformContext` 回调支持外部驱动的上下文压缩
- `Devtools` 集成 12 个断点位置
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
- `HookRegistry` 支持 28 个内置 Hook
- 已有 background.start/background.end、stream metrics、compaction、token budget 等
- 可通过 preset 机制按需启用

**Session Management** (`@vitamin/coding`)
- `CodingSessionManager` 包装 `@vitamin/session` 的 `BaseSessionManager`
- 支持文件持久化和纯内存模式
- 支持 fork、list、delete、多会话并发

### 3.2 当前缺口

1. **orchestrator 包为空** — 无 `src/` 目录，无类型导出
2. **回调实现缺失** — `RegisterBuiltinOptions` 的 9 个回调全部需要 orchestrator 提供
3. **CLI 类型断裂** — `@vitamin/cli` 已导入 `{ AgentRegistry, BackgroundManager, Dispatcher }`，但这些类型不存在
4. **无任务模型** — 缺少统一的 `OrchestratorTask` 生命周期定义
5. **无子代理隔离** — 当前 subagent 调用没有上下文隔离机制
6. **无上下文摘要** — agent 间结果传递没有摘要压缩
7. **无 DAG 执行** — `perform_work` 缺少图化计划引擎
8. **无 review gate** — 缺少质量门禁组件
9. **无重试与恢复** — 缺少 checkpoint 和重试策略

---

## 4. 三方对比矩阵

| 维度 | superpowers | deepagents | vitamin (目标) |
|------|------------|------------|--------------|
| **语言/运行时** | Skills (Markdown/Shell) | Python / LangGraph | TypeScript / 自有 work loop |
| **核心抽象** | Skill (流程定义) | Middleware + Tool | Package + Callback 注入 |
| **子代理模型** | 临时 subagent per task | `SubAgent`/`CompiledSubAgent`/`AsyncSubAgent` | `AgentRegistry` 路由 + 隔离上下文 |
| **计划执行** | writing-plans → executing-plans | write_todos (扁平任务列表) | `PlanEngine` (DAG 拓扑执行) |
| **质量门禁** | Two-stage review (spec → quality) | 无内置 | `ReviewGate` (可插拔检查器链) |
| **上下文管理** | "fresh subagent per task" (无历史继承) | `SummarizationMiddleware` 自动压缩 + 历史外置 | `transformContext` + 历史外置 |
| **Checkpoint** | 无 (Skill 级别无状态) | LangGraph 原生 Checkpointer | `CheckpointStore` 接口 |
| **模型选择** | 文档约定 (cheap/standard/capable) | `resolve_model()` 自动解析 | `AgentRegistry` 按标签路由 |
| **并行执行** | dispatching-parallel-agents (独立域) | 多 `task` tool_call 并行 | `Dispatcher` 并发窗口控制 |
| **安全模型** | 工具/目录约束 (Skill 约定) | "trust the model, enforce at tool boundary" | 工具白名单 + 预算控制 |
| **可观测性** | 无 (依赖宿主平台) | LangSmith 集成 | `HookRegistry` + 事件总线 |

---

## 5. 功能重叠分析

orchestrator 设计必须避免与已有包产生职责重叠。以下逐一分析所有潜在冲突，给出**结论和边界划分**。

### 5.1 上下文压缩 — @vitamin/memory vs orchestrator

**已有实现 (`@vitamin/memory`)**:
- `MemoryManager` 完整实现了 3 层上下文管理:
  - **L1 Persistent** — `PersistentMemory` 加载 AGENTS.md 知识源，支持热重载
  - **L2 Prune** — `prune()` 无 LLM 裁剪：token 累积超过 trigger 阈值后，将保护范围外的旧 `tool_result.content` 替换为 `[pruned]` 占位符，截断 assistant tool_call 参数
  - **L2 Compaction** — `compact()` LLM 驱动摘要：基于 `CompactionConfig.trigger` (默认 85% 上下文窗口) 自动触发，`keepRecent` (默认 10%) 保留最近消息，切点对齐 turn 边界（不在 tool_result 中间切割）
  - **L3 Archive** — `InMemoryArchiveStorage` / `LocalArchiveStorage` 将被压缩消息持久化，支持按 sessionId 索引
- `MemoryManager.process()` 提供一键流程: prune → compaction → archive
- `isEligibleForManualCompact()` 支持手动触发评估

**orchestrator README §9 设计**:
- 借鉴 deepagents `SummarizationMiddleware` 的自动压缩 + 历史外置

**结论: 完全重叠 → orchestrator 不实现压缩**

| 能力 | memory 已有 | orchestrator 需要做 |
|------|-----------|-------------------|
| 自动 token 阈值压缩 | `needsCompaction()` (85%) | **无需** — 直接使用 |
| LLM 驱动摘要生成 | `compact(preparation, summarize)` | **无需** — 直接使用 |
| 手动压缩触发 | `isEligibleForManualCompact()` | **无需** — 通过 hook 暴露工具 |
| 旧消息归档 | `ArchiveStorage` (memory/fs) | **无需** — 直接使用 |
| Turn 边界感知切点 | `findCutPoint()` | **无需** |
| 工具输出裁剪 | `prune()` | **无需** |
| 迭代摘要 | `previousSummary` 链式传递 | **无需** |

orchestrator 的唯一责任: **为子代理构建隔离上下文时，决定是否携带/不携带父级摘要**。压缩本身由 `@vitamin/memory` 在 `AgentSession.prompt()` 的 `transformContext` 回调中驱动。

### 5.2 后台任务追踪 — @vitamin/hooks vs orchestrator BackgroundManager

**已有实现 (`@vitamin/hooks`)**:
- `createBackgroundStartHook()` / `createBackgroundEndHook()` — 纯观测层
- 维护 `activeTasks: Map<taskId, BackgroundTaskRecord>` 和 `completedTasks[]` (最近 100 条)
- 仅记录 `{ taskId, agentName, startTime, endTime, success, durationMs }`
- **无控制能力** — 不能创建、取消、重试任务

**VitaminApp 已有**:
- `emitBackgroundStart(taskId, agentName)` / `emitBackgroundEnd(taskId, agentName, success)` — 纯事件发射

**orchestrator BackgroundManager 需要**:
- `submit(task)` — 实际提交异步任务到执行队列
- `getOutput(id)` — 获取运行中/完成任务的输出
- `cancel(id)` — 取消运行中任务 (AbortController)
- `list()` — 列出所有后台任务

**结论: 不重叠 — 层次互补**

```
┌─────────────────────────────────────┐
│  @vitamin/hooks (观测层)              │
│  background.start / background.end  │  ← 监听事件、记录指标、日志
│  activeTasks / completedTasks       │
└─────────────┬───────────────────────┘
              │ emit
┌─────────────┴───────────────────────┐
│  @vitamin/orchestrator (控制层)       │
│  BackgroundManager                  │  ← 创建/取消/查询任务
│  submit() / cancel() / getOutput()  │
│  内部调用 hooks.emit('background.*') │
└─────────────────────────────────────┘
```

BackgroundManager 在执行提交/完成/取消时调用 `hooks.emit('background.start/end')`，hooks 的 BackgroundTracker 自动记录。两者不冲突。

### 5.3 会话管理 — @vitamin/coding CodingSessionManager vs orchestrator Dispatcher

**已有实现 (`@vitamin/coding`)**:
- `CodingSessionManager` 管理多个 `AgentSession` 的创建/获取/移除/fork
- `AgentSession` 封装 `Agent` + `Session` 对，驱动 `agent.run()` 循环
- 每个 `AgentSession` 拥有独立 model/tools/systemPrompt/hooks
- `VitaminApp` 是最上层容器，管理生命周期

**orchestrator Dispatcher 需要**:
- 接收 `task_delegate` / `agent_call` 请求
- 路由到合适的 agent → 创建隔离 session → 执行 → 收集结果
- 管理任务状态机 (pending → running → completed/failed)
- 并发控制、重试策略

**结论: 不重叠 — orchestrator 是 CodingSessionManager 的消费者**

```
┌─────────────────────────────┐
│  Dispatcher (编排决策层)      │  ← 任务队列 + 状态机 + 路由策略
│  dispatch(args) → {          │
│    agent = registry.resolve()│
│    session = csm.createSession({  ← 复用 CodingSessionManager
│      model: agent.model,     │
│      tools: agent.tools,     │
│      systemPrompt: agent.systemPrompt
│    })                        │
│    session.prompt(args.prompt)│
│    result = collectOutput()  │
│    csm.removeSession(id)     │  ← 子 agent session 用完即销毁
│  }                           │
└─────────────────────────────┘
```

Dispatcher **不复制** CodingSessionManager 的 session 管理能力，而是直接调用其 API 来创建/管理子代理会话。

### 5.4 Agent 创建 — @vitamin/agent createAgent vs orchestrator AgentRegistry

**已有实现 (`@vitamin/agent`)**:
- `createAgent(config)` / `createAgentWithRegistry(config)` — 底层工厂函数
- 接受 `{ model, providerRegistry, stream, devtools }` → 返回 `Agent` 实例
- **无注册、无路由** — 纯实例化

**orchestrator AgentRegistry 需要**:
- 维护多个 `AgentSpec` (name → { model, tools, systemPrompt, capabilities })
- `resolve({ name?, category? })` 路由查找
- 提供 fallback agent

**结论: 不重叠 — AgentRegistry 是元数据注册表，createAgent 是底层工厂**

AgentRegistry 内部调用 `createAgentWithRegistry()` 来实例化 Agent:

```typescript
// AgentRegistry.call() 内部伪代码
const spec = this.resolve(query)
const agent = createAgentWithRegistry({ model: spec.model, providerRegistry })
const tools = toolRegistry.filterByNames(spec.tools ?? [])
const session = codingSessionManager.createSession({
  model: spec.model,
  tools,
  systemPrompt: spec.systemPrompt,
})
await session.prompt(prompt)
```

### 5.5 Skill 系统 — @vitamin/coding skill/ vs orchestrator

**已有实现 (`@vitamin/coding`)**:
- `SkillRegistry` — 内存注册表，支持碰撞检测
- `LocalSkillReader` / `RemoteSkillReader` — 从文件系统/HTTP 加载 Skill
- `loadSkills()` → 发现 + 解析 + 注册
- `formatSkillsForPrompt()` → 生成 system prompt 注入片段
- `DefaultResourceLoader` — 统一资源加载器（AGENTS.md + Skills + Prompt 模板）

**@vitamin/tools 已有**:
- `createSkillLoad(projectRoot, loadSkill)` / `createSkillExecute(projectRoot, executeSkill)` — 工具壳，需注入回调

**结论: 部分重叠，但当前不能直接桥接**

当前实现里，`ResourceLoader` 只提供 `load()/reload()/resources` 快照，不提供 `loadSkill(path)` 或 `executeSkill(name, ...)` 运行时 API；而 `@vitamin/tools` 的 Skill 工具签名是:
- `LoadSkill(path: string)` — 按 `SKILL.md` 路径加载
- `ExecuteSkill(name, input?, parameters?)` — 按名称执行已加载 Skill

因此 orchestrator 不应假设可以直接调用 `resourceLoader.loadSkill()` 或 `skillEngine.execute()`。可实施方案有两种:

1. **在 app/coding 层补一个 SkillAdapter**
  - `load(path)` 内部复用现有 `loadSkills()` / `SkillRegistry`
  - `execute(name, input, parameters)` 内部调用具体 Skill runtime
2. **扩展 `@vitamin/coding`**
  - 为 `ResourceLoader` 增加按路径加载接口
  - 为 skill 子系统增加执行入口

在这些前置改造完成前，README 中的 Skill 接入应视为**适配层需求**，不是现有能力。

### 5.6 Hook 系统 — @vitamin/hooks vs orchestrator 事件

**已有实现**:
- 18 种 `HookTiming` 覆盖: chat/tool/messages/params/session/stream/compaction/background/extension
- `HookRegistry` 支持 preset (default/strict/minimal) + 优先级 + 启用控制
- `emit(timing, data)` 单向通知 + `execute(timing, input, output)` 双向管道

**orchestrator 需要的编排事件**:
- `task.created/started/completed/failed/cancelled/recovered`
- `review.requested/passed/failed`
- `plan.started/step_completed/completed`

**结论: 语义上不重叠，但当前 hooks 不能被外部直接扩展**

当前 `@vitamin/hooks` 的实现是封闭的:
- `HookTiming` 是固定字符串联合
- `HOOK_TIMINGS` 是固定数组
- `createHookBuckets()` 为每个 timing 显式建桶

因此 orchestrator 不能只靠 module augmentation 在外部“追加”新事件名。可实施方案应改为二选一:

1. **Phase 1: orchestrator 自带事件总线**
  - 在 orchestrator 内定义 `task.* / review.* / plan.*` 事件
  - 仅复用现有 `background.start/end` 与 coding 层对接
2. **Phase 2: 重构 `@vitamin/hooks` 为开放式注册模型**
  - hooks 接受动态 timing
  - orchestrator 再统一并入 hooks

因此当前版本不应把“扩展 HookTiming”写成可直接接入的事实，而应标注为**基础包前置改造项**。

### 5.7 重叠分析汇总

| 能力域 | 已有包 | orchestrator 是否新建 | 关系 |
|-------|--------|---------------------|------|
| 上下文压缩/摘要 | `@vitamin/memory` MemoryManager | **否** | 直接使用，不重复实现 |
| 后台任务观测 | `@vitamin/hooks` BackgroundTracker | **否** | 互补：hooks 观测 + orchestrator 控制 |
| 会话 CRUD/Fork | `@vitamin/coding` CodingSessionManager | **否** | orchestrator 是消费者 |
| Agent 实例化 | `@vitamin/agent` createAgent | **否** | 底层工厂，AgentRegistry 调用它 |
| Skill 加载/注册 | `@vitamin/coding` skill/ | **否** | 需新增 SkillAdapter，不能直接桥接 |
| Hook 事件 | `@vitamin/hooks` HookRegistry | **暂不直接接入** | 先用 orchestrator 事件总线，后续再统一 |
| 任务状态机 | 无 | **新建** | Dispatcher 核心 |
| Agent 路由注册 | 无 | **新建** | AgentRegistry 核心 |
| 后台任务控制 | 无 | **新建** | BackgroundManager 核心 |
| DAG 计划执行 | 无 | **新建** | PlanEngine (Phase 2) |
| 质量门禁 | 无 | **新建** | ReviewGate (Phase 3) |

---

## 6. 接入方案

### 6.1 前置改造与总体接入架构

要让 orchestrator 以最小风险接入当前 vitamin，需要先承认 4 个前置条件:

1. `VitaminApp` 当前**没有** `toolRegistry`、`subsystems`、`skillEngine` 等运行时成员
2. `AgentSession` 当前接收的是**显式 tools 数组**，不是 `ToolRegistry`
3. `ResourceLoader` 当前**没有** `loadSkill(path)` 这类按路径加载接口
4. `@vitamin/hooks` 当前**不是**开放式事件模型，不能直接由 orchestrator 追加新 timing

因此下面这张图应理解为**目标装配形态**，而不是当前代码已经具备的装配关系:

orchestrator 作为**中间编排层**，向上承接 `@vitamin/cli` 和 `@vitamin/coding`，向下驱动 `@vitamin/agent` 和 `@vitamin/tools`:

```
                  ┌──────────────┐
                  │ @vitamin/cli │  ← Subsystems 接口消费者
                  └──────┬───────┘
                         │ 构造注入 Subsystems
                         ▼
┌─────────────────────────────────────────────┐
│           @vitamin/coding                    │
│  ┌──────────────┐  ┌───────────────────────┐│
│  │  VitaminApp   │→│ CodingSessionManager  ││
│  │  .start()     │  │  .createSession()     ││
│  │  .hooks       │  │  .getSession()        ││
│  └───────┬──────┘  └───────────────────────┘│
│          │ 创建 + 注入                        │
│          ▼                                   │
│  ┌──────────────────────────────────────────┐│
│  │         @vitamin/orchestrator             ││
│  │  ┌──────────────┐ ┌───────────────┐      ││
│  │  │AgentRegistry │ │  Dispatcher   │      ││
│  │  │ .register()  │ │  .dispatch()  │      ││
│  │  │ .resolve()   │ │  .create()    │      ││
│  │  │ .call()      │ │  .get/list()  │      ││
│  │  └──────────────┘ └───────────────┘      ││
│  │  ┌──────────────────┐                    ││
│  │  │BackgroundManager │                    ││
│  │  │ .submit()        │                    ││
│  │  │ .getOutput()     │                    ││
│  │  │ .cancel()        │                    ││
│  │  └──────────────────┘                    ││
│  └──────────────────────────────────────────┘│
│          │ 注入回调                            │
│          ▼                                   │
│  ┌──────────────────────────────────────────┐│
│  │         @vitamin/tools                    ││
│  │  registerBuiltinTools(registry, root, {   ││
│  │    dispatchTask, callAgent, performWork,  ││
│  │    createTask, getTask, listTasks, ...    ││
│  │  })                                       ││
│  └──────────────────────────────────────────┘│
└─────────────────────────────────────────────┘
```

### 6.2 初始化时序 (Bootstrap Sequence)

当前更稳妥的接入方式，不是直接把全部逻辑塞进现有 `VitaminApp.start()`，而是在**应用装配层**增加一个独立的 orchestration bootstrap。原因是 `VitaminApp` 目前只暴露了 `hooks`、`resourceLoader`、`sessionManager` 等基础设施，并没有 `toolRegistry` / `subsystems` / skill runtime 等对象。

可实施的 Phase 1 方案:
- 在 app/CLI 装配层创建 `ToolRegistry`
- 创建 orchestrator 三件套: `AgentRegistry`、`Dispatcher`、`BackgroundManager`
- 显式把 `toolRegistry.getAvailable(...)` 结果传给 `CodingSessionManager.createSession()`
- 组装满足 CLI 的 `Subsystems` 对象

示意代码应改为“组合根”而非“现有 VitaminApp.start() 直接可写成这样”:

```typescript
// composition root / app bootstrap

async function createSubsystems(app: VitaminApp, deps: {
  toolRegistry: ToolRegistry
  skillAdapter: SkillAdapter
  providerRegistry: ProviderRegistry
}) {
  // 1. 基础设施初始化（已有）
  await app.start()

  // 2. 使用 bootstrapOrchestrator 一次性创建 + 注册 + 生成回调
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

  // 3. 向 ToolRegistry 注入回调（callbacks 与 RegisterBuiltinOptions 签名兼容）
  registerBuiltinTools(deps.toolRegistry, app.workspaceDir, callbacks)

  // 4. 组装 CLI 需要的 Subsystems
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

### 6.3 Dispatcher 内部工作流 — 如何复用 CodingSessionManager

Dispatcher 收到 `task_delegate` 请求后，通过 CodingSessionManager 创建隔离的子代理会话:

```typescript
// Dispatcher.dispatch() 内部实现伪代码

async dispatch(args: DispatchArgs): Promise<DispatchResult> {
  // 1. 创建任务记录
  const task = this.createTask(args)
  await this.hooks.emit('task.created', { task })

  // 2. 解析目标 Agent
  const spec = this.registry.resolve({
    name: args.subagent,
    category: args.category,
  })
  if (!spec) {
    return { success: false, error: 'No matching agent found' }
  }

  // 3. 分支: sync vs background
  if (args.mode === 'background') {
    return this.backgroundManager.submit(task, spec)
  }

  // 4. sync 执行 — 创建隔离 AgentSession
  task.status = 'running'
  await this.hooks.emit('task.started', { task, agent: spec.name })

  try {
    const tools = this.toolRegistry.filterByNames(spec.tools ?? [])
    const session = await this.sessionManager.createSession({
      model: spec.model,
      systemPrompt: spec.systemPrompt,
      tools,                                // ← 显式传入 tools 数组
    })

    // 5. 驱动执行（消息隔离 — 仅传入任务 prompt）
    await session.prompt(args.prompt)

    // 6. 收集结果
    const lastMessage = session.session.messages().at(-1)
    const output = extractTextContent(lastMessage)

    // 7. 销毁子 session（临时会话，用完即弃）
    await this.sessionManager.removeSession(session.id)

    task.status = 'completed'
    task.output = { text: output, summary: output.slice(0, 500) }
    await this.hooks.emit('task.completed', { task, result: task.output })

    return { success: true, output, status: 'completed' }
  } catch (err) {
    task.status = 'failed'
    task.error = { code: 'EXECUTION_ERROR', message: String(err), retriable: true }
    await this.hooks.emit('task.failed', { task, error: task.error })
    return { success: false, error: String(err) }
  }
}
```

### 6.4 BackgroundManager — 如何复用 hooks + session

```typescript
// BackgroundManager.submit() 内部实现伪代码

async submit(task: OrchestratorTask, spec: AgentSpec): Promise<DispatchResult> {
  this.runningTasks.set(task.id, { task })

  // 发射 hook 事件 → BackgroundTracker 自动记录
  await this.hooks.emit('background.start', { taskId: task.id, agentName: spec.name })

  // 异步执行（不阻塞调用者）
  this.executeAsync(task, spec).then(
    (result) => {
      task.status = 'completed'
      task.output = result
      this.runningTasks.delete(task.id)
      this.completedTasks.set(task.id, task)
      void this.hooks.emit('background.end', { taskId: task.id, agentName: spec.name, success: true })
    },
    (err) => {
      task.status = 'failed'
      task.error = { code: 'BG_ERROR', message: String(err), retriable: true }
      this.runningTasks.delete(task.id)
      this.completedTasks.set(task.id, task)
      void this.hooks.emit('background.end', { taskId: task.id, agentName: spec.name, success: false })
    },
  )

  return { success: true, id: task.id, status: 'running' }
}

private async executeAsync(task: OrchestratorTask, spec: AgentSpec) {
  // 复用 CodingSessionManager 创建子 session
  const tools = this.toolRegistry.filterByNames(spec.tools ?? [])
  const session = await this.sessionManager.createSession({
    model: spec.model,
    systemPrompt: spec.systemPrompt,
    tools,
  })

  this.runningSessions.set(task.id, session)

  try {
    await session.prompt(task.input.prompt)
    const lastMsg = session.session.messages().at(-1)
    return { text: extractTextContent(lastMsg) }
  } finally {
    this.runningSessions.delete(task.id)
    await this.sessionManager.removeSession(session.id)
  }
}
```

**取消语义需要修正**:
- 当前 `PromptOptions` 不支持 `AbortSignal`
- 但 `AgentSession` 已暴露 `abort()`

因此 v1 的 `BackgroundManager.cancel(id)` 应实现为:
1. 已排队未运行任务: 直接取消并移出队列
2. 已运行任务: 通过 `runningSessions.get(id)?.abort()` 发起协作式中止
3. 如果后续 `AgentSession.prompt()` 增加 `signal` 支持，再升级为真正的统一取消模型

### 6.5 CLI 接入 — Subsystems 对接

`@vitamin/cli` 的 `Subsystems` 接口已声明依赖:

```typescript
// packages/cli/src/types.ts (现有)
import type { AgentRegistry, BackgroundManager, Dispatcher } from '@vitamin/orchestrator'

interface Subsystems {
  agentRegistry: AgentRegistry
  taskDispatcher: Dispatcher
  backgroundManager: BackgroundManager
  // ...
}
```

接入路径应改为: **组合根先创建 Subsystems，再把 Subsystems 传给 CLI 层**。当前 `VitaminApp` 本身还不是 `Subsystems` 的完整提供者。

### 6.6 与 @vitamin/memory 的协作边界

orchestrator 不直接使用 `MemoryManager`，但间接受益:

```
AgentSession.prompt()
    │
    ├── hooks.execute('messages.transform')         ← 已有
    │     └── 可插入 memory-aware 上下文压缩 hook
    │
    ├── agent.run({ transformContext })              ← 已有
    │     └── MemoryManager.process() 在此触发
    │
    └── 压缩发生在 agent work loop 内部，
        orchestrator 无需感知
```

orchestrator 为子代理构建上下文时:
- **不继承**父 agent 的对话历史 (deepagents 式隔离)
- **不继承**父 agent 的压缩摘要
- 子 agent 自身的 MemoryManager 独立运行
- 子 agent 完成后仅回传最终输出文本

### 6.7 编排事件接入策略

当前不建议把编排事件直接塞进现有 `@vitamin/hooks`。更稳妥的分层方式是:

```typescript
// Phase 1: orchestrator 内部事件
type OrchestratorEvent =
  | 'task.created'
  | 'task.started'
  | 'task.completed'
  | 'task.failed'
  | 'task.cancelled'
  | 'review.requested'
  | 'review.passed'
  | 'review.failed'
  | 'plan.started'
  | 'plan.step_completed'
  | 'plan.completed'
```

接入策略:
1. `background.start/end` 继续复用现有 hooks
2. `task.* / review.* / plan.*` 先留在 orchestrator 自己的事件总线
3. 等 hooks 包重构为开放式 timing 后，再统一桥接

如果团队坚持复用 hooks，则这件事必须被明确列为**前置改造**:
- 修改 `HookTiming`
- 修改 `HOOK_TIMINGS`
- 修改 `createHookBuckets()`
- 扩展 `HookPayloadMap`

仅靠 orchestrator 侧 module augmentation 在当前实现下是不成立的。

### 6.8 ToolRegistry 回调注入时序

当前 `RegisterBuiltinOptions` 的 9 个回调全部是**必填/可选参数**，在初始化时一次性注入:

```
VitaminApp.start()
  │
  ├── 1. 创建 AgentRegistry / Dispatcher / BackgroundManager
  │
  ├── 2. registerBuiltinTools(toolRegistry, root, {
  │        dispatchTask:   ← Dispatcher.dispatch
  │        callAgent:      ← AgentRegistry.call
  │        performWork:    ← Dispatcher.executePlan
  │        createTask:     ← Dispatcher.create
  │        getTask:        ← Dispatcher.get
  │        listTasks:      ← Dispatcher.list
  │        updateTask:     ← Dispatcher.update
  │        getBackgroundOutput: ← BackgroundManager.getOutput
  │        cancelBackground:    ← BackgroundManager.cancel
  │        loadSkill:      ← SkillAdapter.load
  │        executeSkill:   ← SkillAdapter.execute
  │      })
  │
  └── 3. Dispatcher/AgentRegistry 在 createSession() 前显式选择工具
         └── 通过 toolRegistry.getAvailable() / filterByNames() 取出 tools 数组
```

**关键约束**:
- `registerBuiltinTools()` 通常只调用一次
- 但 AgentSession **不会自动读取 ToolRegistry**
- orchestrator 必须在 `createSession()` 前把选好的工具数组显式传进去

### 6.9 依赖关系图

```
@vitamin/orchestrator
  ├── @vitamin/shared     (Logger, TypedEventEmitter, Disposable)
  ├── @vitamin/agent      (createAgentWithRegistry, Agent, types)
  ├── @vitamin/ai         (Model, ProviderRegistry)
  ├── @vitamin/hooks      (HookRegistry, emit)
  └── @vitamin/coding     (CodingSessionManager, AgentSession)  ← 运行时依赖

@vitamin/coding
  ├── @vitamin/orchestrator  (AgentRegistry, Dispatcher, BackgroundManager)  ← 类型 + 创建
  └── ... 其他已有依赖

@vitamin/cli
  └── @vitamin/orchestrator  (类型依赖: AgentRegistry, Dispatcher, BackgroundManager)

@vitamin/tools
  └── @vitamin/orchestrator  (无直接依赖 — 通过回调注入间接关联)
```

**循环依赖风险**: `orchestrator → coding` + `coding → orchestrator`

**解决方案**: 
- `orchestrator` 依赖 `coding` 的具体类型 (CodingSessionManager)
- `coding` 仅依赖 `orchestrator` 的**接口类型** (`import type`)
- 运行时: `VitaminApp` 创建 orchestrator 实例并注入 `codingSessionManager` 引用
- 这是标准的**控制反转**模式，不产生真正的循环 import

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
│  │      performWork,   ← PlanEngine.execute()           ││
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
│  │  @vitamin/hooks                                      ││
│  │    task.created / task.started / task.completed       ││
│  │    agent_call.started / agent_call.completed          ││
│  │    background.started / background.completed          ││
│  │    review.requested / review.passed / review.failed   ││
│  └──────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────┘
```

### 7.2 核心组件

#### AgentRegistry
- 维护 agent 元数据 (name, description, capabilities, model tier, tool whitelist)
- 按名称精确路由 / 按 category 模糊路由
- 提供 fallback agent (类似 deepagents 的 general-purpose subagent)
- 管理 agent 的可用性与健康状态

#### Dispatcher
- 接收任务请求并创建 `OrchestratorTask`
- 根据 mode (sync/background) 分发到不同执行路径
- 维护任务状态机、重试策略、并发配额
- 提供 task CRUD API (create/get/list/update)

#### BackgroundManager
- 管理后台任务的生命周期
- 提供 output 轮询 / cancel 操作
- 支持任务完成事件通知
- 与 hooks/background.start + background.end 对接

#### PlanEngine (Phase 2)
- 解析结构化计划为 DAG
- 按拓扑排序批次并行执行
- 每步执行后写 checkpoint
- 支持失败重试与降级

#### ReviewGate (Phase 3)
- 借鉴 superpowers 的 two-stage review 模式
- 接受可插拔检查器 (spec compliance, code quality, tests, custom)
- 检查通过则推进，不通过则回滚到可恢复点

#### CheckpointStore (Phase 2)
- 记录任务快照、子任务进度、恢复点
- 支持进程重启后的任务恢复

---

## 8. 核心数据模型

### 8.1 OrchestratorTask

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
  // 借鉴 deepagents: 仅返回最终摘要，中间步骤不回传
  intermediateStepsHidden: true
}
```

### 8.3 Plan (Phase 2)

```typescript
interface Plan {
  id: string
  name: string
  steps: PlanStep[]
  edges: Array<{ from: string; to: string }>  // DAG 依赖
  policy: {
    maxParallel: number
    retryPolicy: RetryPolicy
    timeoutMs: number
  }
}

interface PlanStep {
  id: string
  description: string
  executor: string    // agent name
  // 借鉴 superpowers: 每步包含验收条件
  acceptance?: {
    type: 'test_pass' | 'review' | 'custom'
    spec?: string
  }
  dependencies: string[]  // step ids
}
```

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
    │   │   ├── sync → 构建隔离 AgentRunContext → workLoop() → 收集结果
    │   │   └── background → BackgroundManager.submit() → 返回 taskId
    │   └── 4. 发布事件 task.created → task.started → task.completed/failed
    │
    └── 返回 TaskDispatchResult { success, output/id, status }
```

**上下文隔离**(借鉴 deepagents):
- 子 agent 收到的 `AgentRunContext.messages` 仅包含 `[{ role: 'user', content: prompt }]`
- 不继承父 agent 的对话历史、todos、session 状态
- 工具列表由 `AgentRegistry` 中该 agent 的配置决定（可限制）

### 9.2 agent_call 流程

```
Agent → agent_call(agent, prompt, { mode, sessionId })
    │
    ├── AgentRegistry.get(agent)
    │   └── 获取 agent 配置: model, tools, systemPrompt, capabilities
    │
    ├── mode=sync:
    │   ├── 构建隔离上下文
    │   ├── workLoop(context) → AssistantMessage
    │   └── 返回 { success: true, output: message.text }
    │
    └── mode=async:
        ├── BackgroundManager.submit(agentConfig, prompt)
        └── 返回 { success: true, output: 'Submitted as background task' }
```

### 9.3 perform_work 流程 (Phase 2)

借鉴 superpowers 的 subagent-driven-development + deepagents 的 task 并行：

```
Agent → perform_work(planName)
    │
    ├── PlanEngine.load(planName)
    │   └── 解析计划文件 → Plan { steps, edges, policy }
    │
    ├── PlanEngine.buildDAG(plan)
    │   └── 拓扑排序 → 批次组 [[step1], [step2, step3], [step4]]
    │
    ├── For each batch (按批次串行):
    │   ├── 批次内按 maxParallel 并行执行
    │   ├── For each step:
    │   │   ├── Dispatcher.dispatch(step.description, step.executor)
    │   │   ├── CheckpointStore.save(taskId, stepId, snapshot)
    │   │   │
    │   │   ├── 执行结果检查 (借鉴 superpowers):
    │   │   │   ├── step.acceptance.type === 'test_pass'
    │   │   │   │   └── 运行测试命令 → pass/fail
    │   │   │   ├── step.acceptance.type === 'review'
    │   │   │   │   └── ReviewGate.check() → pass/fail
    │   │   │   └── step.acceptance.type === 'custom'
    │   │   │       └── 执行自定义检查器
    │   │   │
    │   │   └── 失败处理:
    │   │       ├── retriable → 指数退避重试
    │   │       ├── needs_context → 补充上下文后重试
    │   │       ├── blocked → 标记 failed + 补救建议
    │   │       └── review_failed → 回滚到 checkpoint
    │   │
    │   └── 批次完成 → 事件: step_batch.completed
    │
    └── 全部完成 → task.completed
```

---

## 10. 状态机与恢复策略

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

### 10.2 重试策略

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

### 10.3 恢复策略

借鉴 deepagents 的 LangGraph Checkpointer：

- 进程重启时 `CheckpointStore.scanIncomplete()` 扫描 running/background 任务
- 对可恢复任务: 从最近 checkpoint 恢复 → 继续执行
- 对不可恢复任务: 标记 `failed` + 附带恢复指引 ("re-run from step X")
- 所有恢复操作发布 `task.recovered` 事件

### 10.4 Implementer Status 处理 (借鉴 superpowers)

当子代理返回非 `done` 状态时：

| 状态 | 处理策略 |
|------|---------|
| `done` | 正常续流 → review gate |
| `done_with_concerns` | 读取 concerns → 判断是否影响正确性 → 选择性处理后续流 |
| `needs_context` | 补充 missingContext → 重新 dispatch 同一 agent |
| `blocked` | 1. 补上下文重试 → 2. 换更强模型 → 3. 拆分任务 → 4. 上报用户 |

---

## 11. 上下文管理与摘要

借鉴 deepagents 的 `SummarizationMiddleware`，vitamin 采用以下策略：

### 11.1 子代理上下文隔离

```typescript
// 为子代理构建独立的 AgentRunContext
function buildIsolatedContext(
  agentSpec: AgentSpec,
  task: OrchestratorTask,
): AgentRunContext {
  return {
    model: agentSpec.model,
    systemPrompt: agentSpec.systemPrompt,
    messages: [{ role: 'user', content: task.input.prompt }],  // 仅传入任务 prompt
    tools: agentSpec.tools,      // 按 agent 配置限制工具集
    maxToolTurns: agentSpec.maxToolTurns ?? 25,
    // 不继承: 父 agent 的 messages, session 状态, steering
  }
}
```

### 11.2 结果摘要回传

子代理执行完成后，仅回传最终输出的摘要文本：

```typescript
// 借鉴 deepagents: SubAgent 返回的最后一条消息被提取为 ToolMessage
function extractSubagentResult(assistantMessage: AssistantMessage): SubagentResult {
  return {
    status: 'done',
    output: assistantMessage.content.text,  // 仅摘要
    intermediateStepsHidden: true,
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

orchestrator 实现所有 `RegisterBuiltinOptions` 回调：

```typescript
// orchestrator 向 tools 注入的回调映射
const callbacks: RegisterBuiltinOptions = {
  dispatchTask:         (args) => dispatcher.dispatch(args),
  callAgent:            (agent, prompt, opts) => agentRegistry.call(agent, prompt, opts),
  performWork:          (name) => planEngine.execute(name),
  createTask:           (args) => dispatcher.create(args),
  getTask:              (id) => dispatcher.get(id),
  listTasks:            (status) => dispatcher.list(status),
  updateTask:           (id, action) => dispatcher.update(id, action),
  getBackgroundOutput:  (id) => backgroundManager.getOutput(id),
  cancelBackground:     (id) => backgroundManager.cancel(id),
  loadSkill:            (path) => skillAdapter.load(path),
  executeSkill:         (name, input, parameters) => skillAdapter.execute(name, input, parameters),
}
```

### 12.2 与 @vitamin/cli

CLI 已声明的 `Subsystems` 接口将获得真实实现：

```typescript
// @vitamin/cli 的 Subsystems 接口
interface Subsystems {
  agentRegistry: AgentRegistry       // ← orchestrator 提供
  taskDispatcher: Dispatcher           // ← orchestrator 提供
  backgroundManager: BackgroundManager // ← orchestrator 提供
  // ... 其他已有子系统
}
```

### 12.3 与 @vitamin/agent

- **不替代** 单 Agent work loop — orchestrator 在任务级别组织多个 `workLoop()` 调用
- 使用统一 `correlationId` 将 orchestrator 事件与 agent 事件串联
- 通过 `AgentRunContext.devtools` 将编排级断点传入 agent 调试器

### 12.4 与 @vitamin/hooks

扩展以下编排级 Hook 事件：

```typescript
// 新增 Hook 事件类型
type OrchestratorHookEvents = {
  'task.created':     { task: OrchestratorTask }
  'task.started':     { task: OrchestratorTask; agent: string }
  'task.completed':   { task: OrchestratorTask; result: TaskOutput }  // Phase 1: TaskOutput; Phase 2: SubagentResult
  'task.failed':      { task: OrchestratorTask; error: TaskError }
  'task.cancelled':   { taskId: string }
  'task.recovered':   { task: OrchestratorTask; fromCheckpoint: string }
  'review.requested': { taskId: string; reviewType: string }
  'review.passed':    { taskId: string; reviewType: string }
  'review.failed':    { taskId: string; reviewType: string; issues: string[] }
  'plan.started':     { planId: string; totalSteps: number }
  'plan.step_completed': { planId: string; stepId: string; remaining: number }
  'plan.completed':   { planId: string }
}
```

### 12.5 与 @vitamin/coding

- 复用 `CodingSessionManager` 的 session 语义管理子代理会话
- 复用 ResourceLoader 中的 AGENTS.md / skill 配置做路由增强
- 子代理可选择复用或新建独立 session

---

## 13. 可观测性与安全

### 13.1 事件与指标

| 事件 | 触发时机 | 携带数据 |
|------|---------|---------|
| `task.created` | Dispatcher 创建任务 | taskId, kind, input |
| `task.started` | 任务开始执行 | taskId, agentName, model |
| `task.completed` | 任务成功完成 | taskId, duration, outputLength |
| `task.failed` | 任务失败 | taskId, error, attempts |
| `background.submitted` | 后台任务提交 | taskId |
| `agent_call.started` | agent_call 开始 | agentName, promptLength |
| `agent_call.completed` | agent_call 完成 | agentName, duration, tokenUsage |
| `review.verdict` | review gate 结论 | taskId, reviewType, passed |

### 13.2 安全边界

借鉴 deepagents "trust the model, enforce at tool boundary" 原则：

| 层面 | 机制 |
|------|------|
| 工具权限 | 子代理按 `AgentRegistry` 配置获得最小工具集 |
| 目录沙箱 | 通过 `projectRoot` 参数限制文件操作范围 |
| 命令白名单 | bash 工具可配置允许/禁止命令列表 |
| Token 预算 | 借鉴 hooks 的 `createTokenBudgetHook()` |
| 并发配额 | `Dispatcher` 限制同时运行的后台任务数 |
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
- 事件: task.created/started/completed/failed 可在 hooks 订阅
- `bootstrapOrchestrator` 返回的 callbacks 可直接传给 `registerBuiltinTools`

> **Phase 1 限制**:
> - `performWork` 返回 NOT_IMPLEMENTED（需 Phase 2 PlanEngine）
> - `agent_call` 的 `sessionId` 参数被接受但不生效（始终创建隔离子会话，需 Phase 2 SessionFactory.getSession）
> - `task.completed` 事件携带 `TaskOutput`（纯文本），Phase 2 升级为结构化 `SubagentResult`

### Phase 2: DAG 执行与 Checkpoint

**目标**: 支持结构化计划的 DAG 执行与失败恢复。

**交付物**:
- `src/plan-engine.ts` — 计划解析 + DAG 拓扑执行
- `src/checkpoint-store.ts` — Checkpoint 接口 + 内存实现
- 扩展 `OrchestratorTask` 支持 `kind: 'plan'`
- `performWork` 回调对接 PlanEngine
- `agent_call` 的 `sessionId` 支持跨调用上下文复用
- `task.completed` 事件升级为携带结构化 `SubagentResult`

**验收标准**:
- `perform_work` 可执行多步计划
- 步骤可按 maxParallel 并行
- 失败可从 checkpoint 恢复

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

## 15. API 草案(TypeScript)

```typescript
// ═══════════════════════════════════════════════
// src/types.ts — 核心类型
// ═══════════════════════════════════════════════

export type TaskStatus = 'pending' | 'running' | 'waiting_review' | 'completed' | 'failed' | 'cancelled'
export type TaskKind = 'delegate' | 'agent_call' | 'plan' | 'adhoc'
export type TaskMode = 'sync' | 'background'

export interface OrchestratorTask {
  id: string
  kind: TaskKind
  status: TaskStatus
  mode: TaskMode
  input: { prompt: string; subagent?: string; category?: string; planRef?: string; sessionId?: string }
  output?: { text: string; artifacts?: Record<string, unknown>; summary?: string }
  error?: { code: string; message: string; retriable: boolean }
  attempts: number
  maxAttempts: number
  parentTaskId?: string
  correlationId: string
  createdAt: number
  startedAt?: number
  endedAt?: number
}

export interface AgentSpec {
  name: string
  description: string
  model: string
  systemPrompt?: string
  tools?: string[]          // 工具白名单
  capabilities?: string[]   // 能力标签
  maxToolTurns?: number
}

// ═══════════════════════════════════════════════
// src/agent-registry.ts
// ═══════════════════════════════════════════════

export interface AgentRegistry {
  register(spec: AgentSpec): void
  get(name: string): AgentSpec | undefined
  resolve(query: { name?: string; category?: string }): AgentSpec | undefined
  list(): AgentSpec[]
  call(agent: string, prompt: string, options?: { mode?: 'sync' | 'async'; sessionId?: string }):
    Promise<{ success: boolean; output?: string; error?: string }>
}

export function createAgentRegistry(): AgentRegistry

// ═══════════════════════════════════════════════
// src/dispatcher.ts
// ═══════════════════════════════════════════════

export interface DispatchArgs {
  prompt: string
  subagent?: string
  category?: string
  mode: 'sync' | 'background'
}

export interface Dispatcher {
  dispatch(args: DispatchArgs): Promise<{ success: boolean; output?: string; id?: string; status?: string; error?: string }>
  create(args: { prompt: string; category?: string; subagent?: string }): Promise<{ id: string; success: boolean; message?: string; error?: string }>
  get(id: string): Promise<OrchestratorTask | undefined>
  list(status?: string): Promise<{ success: boolean; tasks: Array<{ id: string; prompt: string; status: string }>; error?: string }>
  update(id: string, action: 'cancel' | 'retry'): Promise<{ success: boolean; message: string }>
}

export function createDispatcher(registry: AgentRegistry, options?: { maxConcurrent?: number }): Dispatcher

// ═══════════════════════════════════════════════
// src/background-manager.ts
// ═══════════════════════════════════════════════

export interface BackgroundManager {
  submit(task: OrchestratorTask): Promise<string>
  getOutput(id: string): Promise<{ status: string; success: boolean; output?: string; error?: string }>
  cancel(id: string): Promise<{ success: boolean; error?: string }>
  list(): OrchestratorTask[]
}

export function createBackgroundManager(): BackgroundManager

// ═══════════════════════════════════════════════
// src/index.ts — 统一入口
// ═══════════════════════════════════════════════

export { createAgentRegistry } from './agent-registry'
export { createDispatcher } from './dispatcher'
export { createBackgroundManager } from './background-manager'
export type { AgentRegistry, Dispatcher, BackgroundManager, OrchestratorTask, AgentSpec, TaskStatus, DispatchArgs } from './types'
```

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
| Markdown 计划格式 | vitamin 偏好 TypeScript 结构化定义 |

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
| write_todos 工具 | vitamin 计划执行由 PlanEngine 驱动，不依赖 LLM 写 todo |

### 16.3 vitamin 自身设计原则

- **组合式包结构** — 每个包职责单一、可独立测试
- **回调注入模式** — tools 只定义接口，orchestrator 提供实现，松耦合
- **工具边界安全** — 安全控制在 `@vitamin/tools` 层执行，orchestrator 配置策略
- **Hook 驱动可观测性** — 编排事件通过 `@vitamin/hooks` 统一发布
- **渐进式复杂度** — Phase 1 先跑通最小用例，Phase 2-3 逐步引入 DAG/Review
