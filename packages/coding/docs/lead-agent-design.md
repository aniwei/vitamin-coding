# Vitamin Coding Lead Agent 技术实现方案

> 基于 7 个主流 Agent 框架/方法论深度对比分析，结合 vitamin 现有架构设计
>
> **最后更新：** 2026-04-01，基于 vitamin 最新源码审计（orchestrator 源码及编译产物均不存在）

---

## 〇、当前实现状态总览

> 以下为 2026-04-01 基于 **源码文件系统** 审计的实际状态。不参考任何 dist/ 编译产物。
> 设计方案中已实现的部分标记 ✅，未实现标记 ❌，部分实现标记 ⚠️。

| 机制 | 状态 | 位置 | 说明 |
|------|------|------|------|
| **orchestrator 完整运行时** | ❌ 未实现 | `orchestrator/src/` 为空 | src/ 和 dist/ 均不存在任何代码 |
| **Task 类型系统** | ❌ 未实现 | — | 无源码，无编译产物 |
| **TaskGraphStore (DAG)** | ❌ 未实现 | — | 无源码 |
| **FleetManager** | ❌ 未实现 | — | 无源码 |
| **PlanExecutor** | ❌ 未实现 | — | 无源码 |
| **ReviewPipeline** | ❌ 未实现 | — | 无源码 |
| **CheckpointCoordinator** | ❌ 未实现 | — | 无源码 |
| **Scheduler** | ❌ 未实现 | — | 无源码 |
| **CircuitBreaker** | ❌ 未实现 | — | 无源码 |
| **AgentRegistry** | ❌ 未实现 | — | 无源码 |
| **OrchestratorEventBus** | ❌ 未实现 | — | 无源码 |
| **ToolCallbacks (orchestrator)** | ❌ 未实现 | — | 无源码 |
| **WorkflowSlot 类型定义** | ❌ 未实现 | — | 无源码 |
| **WorkflowSlot→Model 绑定** | ⚠️ UI 已有 | `web-ui/ModelSlot.tsx` | 前端选择器已实现，后端 resolver 未接入 |
| **PhaseGateEngine** | ❌ 未实现 | — | 已废弃设计，不再计划实现 |
| **Read-Only Tool Concurrency** | ❌ 未实现 | — | work-loop.ts 仍为全串行 |
| **AgentTool.readonly 标记** | ❌ 未实现 | — | AgentTool 接口无 readonly 字段 |
| **PromptManager / Section Caching** | ❌ 未实现 | — | prompt-manager.ts 不存在 |
| **LeadSession** | ❌ 未实现 | — | lead-session.ts 不存在，使用通用 agent-session.ts |
| **FileState Snapshot** | ❌ 未实现 | — | 仅设计 |
| **Complexity Router** | ❌ 未实现 | — | 已废弃设计，不再计划实现 |
| **Operational Learning** | ❌ 未实现 | — | 仅设计 |
| **Agent work-loop** | ✅ 已实现 | `agent/src/work-loop.ts` | 双层 while 循环 + steering/followUp 注入 |
| **31 种 Hook Timing** | ✅ 已实现 | `hooks/src/types.ts` | 含 task.\*/review.\* 编排器 hook 类型定义 |
| **ToolRegistry + 内置工具** | ✅ 已实现 | `tools/src/` | minimal/standard/full 三级预设 |
| **编排工具回调类型** | ✅ 已实现 | `tools/src/orchestration/` | TaskDispatch/CallAgent/CreateTask/GetTask/ListTasks/UpdateTask/ClarifyRequest |
| **Session DAG + 分支** | ✅ 已实现 | `session/src/` | Session branching + 3 种持久化后端 |
| **Memory 3 层压缩** | ✅ 已实现 | `memory/src/` | Persistent → Prune → Compaction+Archive |
| **VitaminApp 容器** | ✅ 已实现 | `coding/src/app/vitamin-app.ts` | 组装 agent/tools/hooks/session/memory |
| **AgentSession 封装** | ✅ 已实现 | `coding/src/` | 单 agent 完整生命周期管理 |
| **Setting schema (workflow)** | ✅ 已实现 | `setting/src/schema/workflow.ts` | review/retry/circuit\_breaker/routing 配置声明 |
| **ModelRegistry** | ✅ 已实现 | `ai/src/model-registry.ts` | register/resolve/setDefault（无 WorkflowSlot 概念） |

**关键架构事实：**
- `orchestrator/src/` **为空目录**，`orchestrator/dist/` **不存在** — 该包是纯占位包
- `orchestrator/package.json` 声明依赖 `@vitamin/dispatcher` 和 `@vitamin/plan`，但这两个包 **在 workspace 中不存在**（无目录、无 package.json）
- `orchestrator/tsconfig.json` 中 `@vitamin/dispatcher` 和 `@vitamin/plan` 的 path alias 指向不存在的文件
- `tools/src/index.ts` 导出了 `PlanCreate/PlanGet/PlanList/PlanUpdate` 类型，但 **对应源文件不存在**（plan-create.ts 等缺失），会导致编译错误
- 编码层（`@vitamin/coding`）**不引用 `@vitamin/orchestrator`**，使用通用 `agent-session.ts` 包装 agent
- `vitamin-app.ts` 中 `taskDispatch` 和 `callAgent` 回调是 **空实现**（返回 `success: false`），且编排/技能类工具在注册后被 **主动移除**
- Prompt 组装在 `system-prompt.transform` hook 中完成，**无独立 PromptManager**

---

## 〇.1 核心设计原则：硬编码 vs. 大模型决策分界线

> **"运行时提供能力（tools），Prompt 提供指导（guidance），大模型做决策。代码只负责：类型安全、并发安全、持久化、hook 拦截。"**

### 7 大框架的共同模式

通过分析 Superpowers / Deep Agents / OpenDev / gstack / InfiAgent / Open Agent SDK / Pi-mono，发现一个共性——**所有成功的 Agent 框架都不会在代码中硬编码工作流决策**：

| 决策 | 硬编码 ❌ | 框架实际做法 ✅ |
|------|----------|----------------|
| 阶段转换 | `if (phase === 'plan') forbidTool('write_file')` | Superpowers/gstack: SKILL.md 文本指导 LLM 在正确阶段使用正确工具 |
| 复杂度分类 | `if (fileCount <= 1) return 'direct'` | 所有框架: LLM 阅读 prompt 指引自行判断，调用不同工具表达决策 |
| 模型/槽位选择 | `if (requiresDesign) return 'thinking'` | OpenDev/InfiAgent: AgentSpec 配置默认 slot，LLM 在 dispatch 时指定 |
| Review 流程 | `implement → specReview → qualityReview` 固定管线 | Superpowers: controller SKILL.md 指导 LLM 何时调用 review subagent |
| 上下文压缩策略 | `if (tokens > N) switchToSnapshot()` | InfiAgent: thinking module 自行判断何时刷新文件状态 |
| 经验分类 | `type: 'pattern' \| 'pitfall' \| 'preference'` | gstack: `/learn` 自由格式，LLM 自行组织 |

### vitamin 的分界线

```
┌─────────────────────────────────────────────────────────────────┐
│                     代码层（Runtime）                            │
│  只做：                                                         │
│  · 类型安全（Task / WorkflowSlot / FleetSpec）              │
│  · 并发安全（read-only 并发 / mutation 串行 / fleet 窗口）      │
│  · 持久化（checkpoint / session / lesson 存储）                 │
│  · hook 拦截（31 timing + orchestrator 26 events）              │
│  · slot→model 映射（配置驱动，非规则驱动）                       │
│  · 工具元数据（readonly 标记是工具固有属性，非上下文决策）        │
├─────────────────────────────────────────────────────────────────┤
│                   配置层（Settings / AgentSpec）                 │
│  可调：                                                         │
│  · 默认模型、slot→model 映射表                                  │
│  · 工具预设（minimal/standard/full）                            │
│  · hook 预设（default/strict/minimal/none）                     │
│  · review 策略（是否启用、失败后 retry/cancel/escalate）        │
│  · retry 策略（max_attempts、backoff）                         │
│  · circuit breaker 阈值                                        │
│  · checkpoint 策略（after_each_step / every_n / never）         │
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
│  · 何时创建 checkpoint                                          │
│  · 何时捕获文件状态快照                                         │
│  · 提取和记录经验                                               │
│  · 选择调用哪些工具、传什么参数                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 一、外部框架对比矩阵

| 维度 | Superpowers | Deep Agents | Pi-mono | OpenDev | GStack | InfiAgent | Open Agent SDK |
|------|-------------|-------------|---------|---------|--------|-----------|----------------|
| **定位** | 方法论/技能框架 | Agent harness/SDK | 编码 Agent 工具链 | 终端编码 Agent | 流程技能套件 | 无限时域多级 Agent | claude-code 开源 SDK |
| **语言** | Markdown/Shell | Python (LangGraph) | TypeScript | Rust | TypeScript/Markdown | Python | TypeScript |
| **Agent 架构** | 单 Agent + 子 Agent 调度 | 单 Agent + sub-agent(task) | 单 Agent + 工具调用 | 并行 Agent Fleet | 无 Agent 层（纯 skill prompt） | 树状 Multi-Level Serial | 单 Agent + Team + Worktree |
| **规划系统** | 外置 spec→plan→execute 管线 | `write_todos` 内置 | 无独立规划层 | 无独立规划层 | `/autoplan` 自动管线 | 无独立规划（thinking module） | `EnterPlanMode/ExitPlanMode` |
| **上下文管理** | 子 Agent 隔离上下文 | auto-summarization | 未公开 | 9-segment compact | 无 | Ten-Step (思考模块刷新文件空间状态) | 9-segment structured extraction |
| **工具体系** | SKILL.md 自动发现 | read/write/edit/bash/grep + MCP | 与 claude-code 同构 | 内置 + MCP | slash command = SKILL.md | config YAML 定义工具 | 26 内置 + 自定义 + MCP |
| **质量门禁** | spec→quality 两阶段 review subagent | 无内置 | 无内置 | self-critique workflow | `/review` + `/qa` + `/cso` | judge_agent (-1级) | PreToolUse/PostToolUse hooks |
| **模型绑定** | 按任务复杂度选模型 | provider-agnostic | multi-provider | 5 workflow slot 独立绑定 | 无（依赖宿主） | per-agent 独立模型 | 单模型 |
| **会话恢复** | git worktree + plan file | 无 | 无 | `--continue` resume | `/checkpoint` | task_id workspace 恢复 | `resume` session ID |
| **并行执行** | subagent-driven-development | sub-agent `task` 工具 | 无 | Agent Fleet 并行 | Conductor 10-15 并行 | 串行（由架构保证） | Team + Worktree |

---

## 二、关键创新点提取

### 2.1 Superpowers — 方法纪律 (Method Discipline)

**核心洞察：** Agent 不是工具集合，是方法论的运行时。

- **HARD-GATE 机制**：brainstorm 完成前禁止实现，plan 完成前禁止执行。phase transition 由 SKILL.md 强制。
- **子 Agent 两阶段 Review**：每个 task 完成后先 spec compliance review，再 code quality review，循环直到通过。
- **Controller-Implementer 分离**：controller（lead）负责提取 task 全文并构造精确上下文传给 subagent，subagent 永不读取原始 plan 文件。
- **模型分层选择**：机械任务→cheap model，集成任务→standard model，架构/设计/review→most capable model。
- **状态协议**：`DONE | DONE_WITH_CONCERNS | NEEDS_CONTEXT | BLOCKED` — 与 vitamin 已有协议完全一致。

**vitamin 可吸收：**
1. HARD-GATE 相转换（当前 lead prompt 有 phase discipline 文字，但无运行时强制）
2. 两阶段 review subagent 流程
3. 按任务复杂度自动选择模型

### 2.2 Deep Agents — Harness 模式

**核心洞察：** 提供开箱即用的 Agent + 可覆盖层。

- **write_todos** 作为核心规划工具（轻量级、模型内联的 plan）
- **sub-agent 通过 `task` 工具派生**，隔离上下文窗口
- **auto-summarization** 在对话变长时自动压缩
- **LangGraph 原生**：checkpoint、streaming、persistence 自然落地

**vitamin 可吸收：**
1. `write_todos` 概念可用于轻量级场景（当前 vitamin 只有 heavy `plan_create`）
2. sub-agent 上下文窗口隔离模式验证了 vitamin 的 ephemeral session 方向

### 2.3 InfiAgent/MLA — 无限时域执行

**核心洞察：** 文件系统是状态的真实来源，不是对话历史。

- **Ten-Step Strategy**：每 30 步 thinking module 更新文件空间状态描述，agent 只保留最近 10 步；不需要上下文压缩。
- **Nested Attention**：长文档不入 context，通过 `answer_from_pdf/document` 工具查询式抽取。
- **树状层级**：Level 3（orchestrator）→ Level 2（specialist）→ Level 1（executor）→ Level 0（tools）→ Level -1（judge）
- **Call Graph Shared Context**：`hierarchy_manager` 注入 parent/siblings/allowed_tools 防止越权。
- **per-agent 模型独立**：`execution_model`, `thinking_model`, `compressor_model`, `image_generation_model`, `read_figure_model`

**vitamin 可吸收：**
1. **File-State-as-Truth**：在长任务中引入文件空间状态快照替代历史压缩
2. **层级隔离的 Call Graph Context**：subagent 收到的 context 包含 parent/siblings/scope 的显式描述
3. **per-workflow-slot 模型绑定**：`thinking | execution | compaction` 三插槽独立模型

### 2.4 OpenDev — Compound AI System

**核心洞察：** 不同工作流绑定不同模型是架构选择，不是配置选项。

- **5 Workflow Slots**：Normal（执行）、Thinking（推理）、Compact（压缩）、Critique（自审）、VLM（视觉）
- **Agent Fleet**：并行子 Agent，各自独立 LLM binding + context window + tool access
- **Rust 性能**：4.3ms 启动，9.4MB 内存 — 证明 runtime overhead matters
- **per-turn system prompt composition with section caching**（最新 commit）

**vitamin 可吸收：**
1. **Workflow Slot 模型绑定**：vitamin 当前 ModelRegistry 已有 `resolve(spec)` 能力，可扩展为 slot→model 映射
2. **Section Caching**：system prompt 按 section 缓存，只在内容变化时重新拼接（减少 prompt 重复计算）
3. **Agent Fleet 并行**：vitamin BackgroundManager 已有 `submit()` 能力，可升级为 fleet dispatch

### 2.5 GStack — Sprint 流程即产品

**核心洞察：** 把软件工程流程编码为有序的 slash command 管线。

- **Think → Plan → Build → Review → Test → Ship → Reflect**：每个 skill 知道前序 skill 的产出
- **Autoplan**：`/autoplan` 自动串联 CEO→Design→Eng review，只在 taste decision 处暂停
- **Session Intelligence Layer**：`/checkpoint` + `/health` + context recovery
- **跨 Agent 兼容**：Claude Code, Codex, Gemini CLI, Cursor, Factory Droid — 同一套 SKILL.md
- **Review Readiness Dashboard**：跟踪哪些 review 已完成，自动判断是否 ready to ship
- **Operational Learning**：`/learn` 管理跨 session 的 pattern/pitfall/preference 记忆

**vitamin 可吸收：**
1. **Autoplan Pattern**：将 plan review 管线自动化，只在需要人类判断的 taste decision 处暂停
2. **Review Readiness Gate**：在 conclude 前自动检查所有必要 review 是否通过
3. **Operational Learning**：vitamin memory 系统可扩展为自动记录 pattern→lesson mapping

### 2.6 Open Agent SDK — In-Process Engine

**核心洞察：** 完整的 claude-code 引擎以 SDK 形式提供。

- **4-layer permission pipeline**：rules → low-risk skip → whitelist → AI classifier + circuit breaker
- **Auto-memory with 4 types**：user / feedback / project / reference + autoDream 后台整理
- **9-segment context compression**：autocompact, microcompact, snip compact
- **Leader/Teammate team model**：leader 分配工作，teammate 在 git worktree 中隔离执行
- **工具并发策略**：read-only 工具并发批处理，mutation 工具串行

**vitamin 可吸收：**
1. **分层 Permission Pipeline**：当前 vitamin 只有 hook-based guard，可升级为分层 pipeline
2. **工具并发策略**：read-only 工具可并发执行（当前 vitamin 全部串行）
3. **autoDream 后台记忆整理**：利用空闲时间自动整理记忆

---

## 三、Vitamin Lead Agent 技术实现方案

### 3.0 设计原则

基于对比分析 + 硬编码审计（§〇.1），vitamin lead agent 方案遵循以下原则：

1. **LLM-Driven Decisions**（核心原则）：框架没有硬编码的部分不能硬编码，能给大模型决策的不能硬编码。代码提供能力（tools/hooks/types），Prompt 提供引导，LLM 运行时做选择。
2. **Prompt as Policy**（from Superpowers/gstack）：阶段纪律、复杂度评估、review 时机等全部通过 system prompt 注入引导文本实现，不用代码 if/else 强制。
3. **Capability over Pipeline**（from Deep Agents/Open Agent SDK）：review、dispatch、plan、fleet、checkpoint 都是可用的工具/API，LLM 在需要时调用，而非固定管线自动串联。
4. **Configuration over Convention**（from OpenDev/InfiAgent）：slot→model 映射、retry 策略、review 策略等通过配置声明，不硬编码规则。
5. **Metadata for Intrinsics Only**（from Open Agent SDK）：只有工具固有属性（如 `readonly`）才标记为元数据；上下文相关的决策（如"是否 review"）不编码为元数据。
6. **Read-Only Concurrency**（from Open Agent SDK）：只读工具并发，写入工具串行 — 这是并发安全的固有约束，不是决策。

### 3.1 Phase Context Injection（阶段上下文注入）

**问题：** 当前 lead prompt 的 5 phase discipline 是纯文字指令，LLM 可能跳过。

**当前状态：** ❌ 未实现。

**方案：** Phase 作为上下文标注注入 system prompt，LLM 自我调节。

```
Phase Discipline = Prompt引导 + 上下文标注 + 可选软监控
                    ≠ 代码强制 + 工具封锁 + 状态机
```

**机制拆解：**

**1) Phase Context Annotation（代码层 — 仅注入状态，不做决策）**

```typescript
// 通过 system-prompt.transform hook 注入
// 注入的是上下文信息，不是工具限制
interface PhaseAnnotation {
  currentPhase: string     // LLM 上一次声明的 phase（从 metadata 读取）
  phaseHistory: string[]   // 已经历的 phases
  tasksSummary?: string    // 当前 phase 已完成的工作摘要
}

// hook 实现：纯注入，不拦截
function injectPhaseContext(systemPrompt: string, annotation: PhaseAnnotation): string {
  return systemPrompt + `\n\n[Phase Context]\nCurrent: ${annotation.currentPhase}\nHistory: ${annotation.phaseHistory.join(' → ')}`
}
```

**2) Phase Guidance（Prompt 层 — 引导 LLM 行为）**

在 system prompt 中提供阶段纪律引导（非强制）：

```markdown
### Phase Discipline
你在执行任务时应遵循以下阶段模型：

**Clarify** → **Plan** → **Execute** → **Verify** → **Conclude**

- **Clarify**: 理解需求，阅读相关代码，提出澄清问题。不要在此阶段修改文件。
- **Plan**: 制定方案（简单任务可内联规划，复杂任务使用 plan 工具）。
- **Execute**: 实施变更，按计划逐步执行。
- **Verify**: 自查变更是否正确，运行相关测试。
- **Conclude**: 总结完成的工作和遗留事项。

简单请求（单文件查询/编辑）可折叠阶段，无需严格遵循全部步骤。
当你进入新阶段时，请在回复中声明： `[Phase: Execute]`
```

**3) Phase Monitor（可选 — 软监控，非强制）**

```typescript
// 可选的 tool.execute.after hook：记录日志，不阻止执行
// 仅用于 devtools/metrics，不影响 LLM 行为
function phaseMonitorHook(toolName: string, phaseAnnotation: PhaseAnnotation) {
  if (phaseAnnotation.currentPhase === 'clarify' && isMutationTool(toolName)) {
    logger.warn(`Tool ${toolName} called during clarify phase — consider reviewing`)
    // ⚠️ 不 cancel、不 block、不 throw — 只记录
  }
}
```

**实现路径：**
1. 在 `system-prompt.transform` hook 中注入 phase annotation（从 session metadata 读取）
2. Lead prompt 中加入 Phase Discipline 引导文本
3. LLM 回复中的 `[Phase: X]` 标记通过 `chat.message.after` hook 提取存入 session metadata
4. 可选：devtools 面板显示当前 phase（只读监控）

### 3.2 Compound Model Binding（复合模型绑定）

**问题：** 当前所有 workflow 使用同一模型，无法区分推理、执行、压缩的成本/能力需求。

**当前状态：** ⚠️ 仅前端 UI 存在。
- ❌ `WorkflowSlot` 类型未定义 — orchestrator 无任何源码
- ❌ `AgentSpec` / `AgentRegistry` 不存在 — orchestrator src/ 为空
- ⚠️ `web-ui/ModelSlot.tsx` 前端选择器已实现（provider + model 下拉 + verify）
- ❌ `ModelSlotResolver`（slot → model 映射逻辑）未在 `@vitamin/ai` 中实现
- ❌ `ModelSlotConfig` 未加入 `VitaminSetting` schema
- ❌ `AgentRunContext` 中无 `modelSlot` 字段
- ✅ `ModelRegistry` 已有 `resolve(spec)` 能力，可扩展为 slot→model 映射
- ✅ `setting/schema/agents.ts` 已有 per-agent `model` 配置

**方案：** 在已有 WorkflowSlot 类型基础上，补充后端 resolver 逻辑。

```typescript
// packages/ai/src/model-slots.ts（待新建）

type WorkflowSlot = 'normal' | 'thinking' | 'compact' | 'critique' | 'vision'

interface ModelSlotConfig {
  /** 每个 slot 的模型 spec，支持 fallback chain */
  slots: Partial<Record<WorkflowSlot, ModelSpec | ModelSpec[]>>
  /** 未配置 slot 的默认 fallback */
  default: ModelSpec
}

interface ModelSlotResolver {
  resolve(slot: WorkflowSlot): Model
}
```

**与 InfiAgent model-per-agent 的差异：** vitamin 按 workflow slot 绑定而非按 agent 绑定，因为 vitamin 的 agent 是运行时创建的（非静态配置），slot binding 更灵活。

**WorkflowSlot 选择 — LLM 决策，非代码规则：**

WorkflowSlot 通过以下途径确定（优先级从高到低）：

1. **LLM 在 tool 参数中显式指定** — 当 LLM 调用 `dispatchTask` / `createTask` / `callAgent` 时，可指定 `workflowSlot` 参数
2. **AgentSpec.defaultWorkflowSlot** — agent 注册时配置的默认 slot（配置层）
3. **全局默认** — `ModelSlotConfig.default`（配置层）

```typescript
// Prompt 引导 LLM 在 dispatch 时选择合适的 slot
// system prompt 中注入：
`当 dispatch 或创建子任务时，你可以指定 workflowSlot：
- normal: 常规执行任务
- thinking: 需要深度推理的设计/架构决策
- compact: 上下文压缩、摘要生成
- critique: 代码审查、spec 检查
- vision: 涉及图像/截图理解的任务
如不指定，将使用 agent 的默认 slot。`
```

**运行时只做 slot→model 映射（无选择逻辑）：**

```typescript
// packages/ai/src/model-slots.ts — 纯配置驱动的 resolver
class ModelSlotResolver {
  resolve(slot: WorkflowSlot): Model {
    // 从 ModelSlotConfig 查表，不含任何 if/else 决策逻辑
    return this.config.slots[slot] ?? this.config.default
  }
}
```

**实现路径：**
1. `ModelSlotConfig` 加入 `VitaminSetting` schema，对接 web-ui 已有的 `ModelSlot.tsx` 组件
2. `ModelSlotResolver` 在 `@vitamin/ai` 中实现，读取 setting 中的 slot 配置
3. `AgentRunContext` 新增 `modelSlot?: WorkflowSlot` 字段
4. Orchestrator 在创建 session 时将 `task.workflowSlot` 传递给 resolver

### 3.3 Review as Capability（Review 作为能力，非固定管线）

**问题：** 当前 `task_delegate` 是简单的 prompt → subagent → result 单轮，缺乏 review loop。

**当前状态：** ❌ 未实现。
- ❌ `ReviewPipeline` / `ReviewPolicy` / `TaskExecutor` — orchestrator 无任何源码
- ✅ `hooks/src/types.ts` 已定义 `review.requested/passed/failed` hook timing 类型
- ✅ `setting/schema/workflow.ts` 已有 `review.enabled` 配置声明
- ✅ `task_delegate` 工具已有 `category` 参数，可用于指定 review 类别

**方案：** Review 是 LLM 可调用的能力，不是自动触发的管线。

```
Review = Tool Capability（LLM 按需调用）
      ≠ Fixed Pipeline（代码自动串联）
```

**机制拆解：**

**1) Review 能力暴露为 Tool（代码层）**

```typescript
// dispatchTask 已有 category 参数，LLM 可指定 category: 'review'
// 或通过 callAgent 直接调用注册的 reviewer agent
// 无需新增 SubagentExecutor — 已有的 ToolCallbacks 足够
interface DispatchTaskArgs {
  prompt: string
  agentName?: string    // LLM 可指定 'spec-reviewer' / 'quality-reviewer'
  category?: string     // LLM 可指定 'review'
  mode?: 'sync' | 'background'
  workflowSlot?: WorkflowSlot  // LLM 可指定 'critique'
}
```

**2) Review 时机引导（Prompt 层）**

```markdown
### Review Guidance
完成子任务实现后，你可以根据任务复杂度决定是否发起 review：

- 对 **关键架构变更** 或 **跨模块修改**，建议使用 `dispatchTask` 发起 spec review
  （指定 category: 'review'，在 prompt 中说明需要检查什么）
- 对 **代码质量敏感** 的变更，可追加 quality review
- 对 **简单修改**（typo、单行修复），无需 review

Review 不通过时，你可以将反馈传回实现者重新修复，然后再次请求 review。
这个循环由你（lead agent）驱动，不是自动触发的。
```

**3) Reviewer Agent 注册（配置层）**

```typescript
// 通过 AgentRegistry.register() 注册，而非硬编码管线
const specReviewer: AgentSpec = {
  name: 'spec-reviewer',
  description: 'Reviews implementation against specification requirements',
  categories: ['review'],
  defaultWorkflowSlot: 'critique',
  defaultSessionPolicy: 'ephemeral'
}

const qualityReviewer: AgentSpec = {
  name: 'quality-reviewer',
  description: 'Reviews code quality, patterns, and best practices',
  categories: ['review'],
  defaultWorkflowSlot: 'critique',
  defaultSessionPolicy: 'ephemeral'
}
```

**实现路径：**
1. 注册 `spec-reviewer` / `quality-reviewer` AgentSpec（配置）
2. Lead prompt 中加入 Review Guidance 引导文本
3. 已有 `dispatchTask` / `callAgent` 工具即可发起 review（无需新 tool）
4. 已有 `ReviewPipeline` 处理 review 后的 retry/escalate（配置驱动）

### 3.4 File-State Snapshot（文件状态快照）

**问题：** 长任务对话历史过长时，当前压缩策略（summarization）会丢失关键细节。

**当前状态：** ❌ 未实现。Memory 包有 3 层压缩（L1 Persistent / L2 Prune / L3 Compaction+Archive），但无文件系统状态快照策略。

**方案：** 快照作为**工具能力**暴露 + **hook 触发点**提供，不硬编码触发条件。

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

// 能力层：提供 capture 和 inject 方法
interface FileStateManager {
  /** 捕获当前文件状态 — 由 LLM 工具调用或 hook 触发 */
  capture(workspaceDir: string, recentMessages: AgentMessage[]): Promise<FileStateSnapshot>
  /** 在 transformContext 中注入最新快照 */
  injectSnapshot(messages: AgentMessage[], snapshot: FileStateSnapshot): AgentMessage[]
}
```

**触发方式（全部非硬编码）：**

| 触发者 | 方式 | 说明 |
|--------|------|------|
| **LLM 主动** | 调用 `capture_file_state` 工具 | LLM 感知上下文过长时主动触发 |
| **compaction hook** | `compaction.before` 检查是否需要 snapshot | 在已有 compaction 流程中嵌入 |
| **checkpoint** | `CheckpointCoordinator.save()` 附带快照 | checkpoint 时自然携带文件状态 |

**Prompt 层引导：**

```markdown
### File State Awareness
当你感知到对话已经很长、上下文可能遗漏了之前的文件变更时，
可以调用 `capture_file_state` 工具刷新工作空间状态。
这会生成一份当前文件树和最近修改的摘要，帮助你恢复上下文。
```

**实现路径：**
1. `FileStateManager` 在 `@vitamin/memory` 中实现（纯能力，无自动触发逻辑）
2. 注册 `capture_file_state` 工具（LLM 可调用）
3. `compaction.before` hook 中可选嵌入 snapshot 能力
4. Snapshot 使用 compact slot 模型生成（配置驱动）

### 3.5 Progressive Complexity Routing（渐进复杂度路由）

**问题：** 当前所有请求走同一条 Lead→Orchestrator→Subagent 路径，简单任务 overhead 过大。

**当前状态：** ❌ 未实现。
- 当前编码层 (`agent-session.ts`) 直接调用 agent.run()，无 tier 分流
- orchestrator 无任何源码

**方案：** 复杂度路由完全由 LLM 在 prompt 引导下决策，通过选择不同 tool 表达。

```
复杂度路由 = LLM 阅读 Prompt 引导 → 选择不同工具路径
          ≠ 代码分类器 → if/else 路由
```

**LLM 表达复杂度决策的方式（已有工具即可）：**

| LLM 判断 | LLM 行为 | 使用的已有工具 |
|----------|---------|---------------|
| 简单（单文件查询/编辑） | 直接调用 read/write/edit/bash | 内置 minimal 工具集 |
| 中等（几个文件，明确范围） | 内联规划后直接执行 | write\_todos（轻量 plan） + 内置工具 |
| 复杂（跨模块，需设计） | 创建正式 plan → dispatch 子任务 → review | plan\_create + dispatchTask + review |

**Prompt 层引导（代替代码分类器）：**

```markdown
### Complexity Routing
在开始工作前，评估请求的复杂度：

- **Direct**（单文件、无歧义、无设计决策）：直接使用工具完成
- **Lightweight**（2-3 文件、范围清晰）：内联规划后执行，可选 self-review
- **Full Pipeline**（跨模块、需要设计、多步骤）：制定计划，委派子任务，请求 review

你不需要显式声明 tier —— 根据评估选择合适的工具路径即可。
```

**代码层不做路由 —— 只提供工具：**

通过工具可用性自然引导（tool preset = 'standard' 时有 `task_delegate`，= 'full' 时有 `plan_create` / `dispatchTask` 等），LLM 根据复杂度自行选择调用哪些工具。不需要 `complexity-router.ts`。

**实现路径：**
1. Lead prompt 中加入 Complexity Routing 引导文本
2. 确保 tool preset 层级对齐：minimal=直接执行能力，standard=委派能力，full=计划+舰队能力
3. `write_todos` 风格的轻量 plan 工具作为 Tier 2 路径的承载（新工具，但由 LLM 决定何时使用）

### 3.6 Read-Only Tool Concurrency（只读工具并发）

**问题：** 当前 work-loop 中所有工具串行执行，多个 `read_file`/`grep` 等只读操作浪费时间。

**当前状态：** ❌ 未实现。
- `work-loop.ts` 使用 `for...of` + `await` 逐个执行 tool call（完全串行）
- `AgentTool` 接口仅有 `name/description/parameters/visibility/execute`，**无 `readonly` 字段**
- `register-builtin.ts` 注册工具时仅标记 `preset/category/builtin`，无只读注解

**方案：** 工具分类为 read-only 和 mutation，read-only 工具支持并发执行。

```typescript
// packages/agent/src/tool-executor.ts 增强

interface ToolConcurrencyPolicy {
  /** 工具是否为只读 */
  isReadOnly: (tool: AgentTool) => boolean
  /** 最大并发数 */
  maxConcurrency: number
}

// work-loop.ts 中的变更
async function executeToolCalls(
  toolCalls: ToolCall[],
  tools: AgentTool[],
  policy: ToolConcurrencyPolicy
): Promise<ToolResultMessage[]> {
  // 将 toolCalls 分为 read-only 和 mutation
  const readOnly = toolCalls.filter(tc => policy.isReadOnly(findTool(tc, tools)))
  const mutations = toolCalls.filter(tc => !policy.isReadOnly(findTool(tc, tools)))

  // read-only 并发执行
  const readResults = await Promise.all(
    readOnly.map(tc => executeSingleTool(tc))
  )

  // mutation 串行执行（在 read-only 全部完成后）
  const mutationResults: ToolResultMessage[] = []
  for (const tc of mutations) {
    mutationResults.push(await executeSingleTool(tc))
  }

  return [...readResults, ...mutationResults]
}
```

**只读工具列表：** `read_file`, `grep`, `glob`, `ls`, `find`, `lsp.definition`, `lsp.references`, `lsp.symbols`, `plan_get`, `plan_list`, `task_get`, `task_list`

**实现路径：**
1. `AgentTool` 接口新增 `readonly?: boolean` 属性
2. `work-loop.ts` 的 tool execution 逻辑改为 batch-then-serial
3. `ToolRegistry.register()` 对内置工具标记 `readonly`

### 3.7 Operational Learning（运行学习）

**问题：** 当前 memory 系统是被动的（只加载 `.agent-instructions.md`），不会从执行结果中学习。

**当前状态：** ❌ 未实现。Memory 包有 3 层持久化但无自动 lesson extraction。

**方案：** 经验提取和注入由 LLM 驱动，存储层只负责持久化。

```typescript
// packages/memory/src/operational-learning.ts

interface Lesson {
  id: string
  tags: string[]         // LLM 自由生成的标签（不限定固定类型）
  trigger: string        // 触发情境
  insight: string        // 学到的内容
  sourceSessionId: string
  createdAt: number
  appliedCount: number
}

interface OperationalLearningStore {
  /** 存储 lesson（LLM 通过工具调用写入） */
  save(lesson: Omit<Lesson, 'id' | 'createdAt' | 'appliedCount'>): Promise<Lesson>
  /** 语义搜索相关 lessons（用于 prompt 注入） */
  search(query: string, limit?: number): Promise<Lesson[]>
  /** 列出/删除 */
  list(filter?: { tags?: string[]; query?: string }): Promise<Lesson[]>
  delete(id: string): Promise<void>
}
```

**LLM 驱动的经验提取（非代码分析器）：**

| 方式 | 触发者 | 说明 |
|------|--------|------|
| `learn` 工具 | LLM 主动调用 | LLM 在执行过程中发现可复用经验时主动记录 |
| Session 结束 prompt | `session.idle` hook | 注入一轮 "请总结本次会话的可复用经验" prompt |
| Steering 注入 | 用户手动 | 用户通过 steer 消息要求 LLM 记录经验 |

**Prompt 层引导：**

```markdown
### Learning from Experience
当你在工作中发现以下情况，使用 `learn` 工具记录经验：
- 反复出现的模式或陷阱
- 用户纠正了你的做法
- 某种方法特别有效或无效
- 项目特有的约定或偏好

经验会在未来相关任务中自动注入你的上下文。
```

**注入机制：** 在 `system-prompt.transform` hook 中，使用 `OperationalLearningStore.search()` 查找与当前 prompt 相关的 lessons，注入 top-K 到 system prompt。

**实现路径：**
1. `OperationalLearningStore` 在 `@vitamin/memory` 中实现（纯存储 + 搜索）
2. 注册 `learn` 工具（LLM 可调用写入）
3. `system-prompt.transform` hook 中注入相关 lessons
4. `session.idle` hook 中可选触发经验提取 prompt

---

## 四、实现阶段规划

### Phase 0 — orchestrator 包重建（前置条件）

| 编号 | 任务 | 包 | 优先级 | 说明 |
|------|------|-----|--------|------|
| 0.1 | 在 orchestrator src/ 中创建最小可用源码 | `@vitamin/orchestrator` | **P0 阻塞** | src/ 和 dist/ 均为空，需从零开始实现 |
| 0.2 | 解决 dispatcher/plan 包依赖问题 | `@vitamin/orchestrator` | P0 | package.json 声明了不存在的 @vitamin/dispatcher 和 @vitamin/plan，需移除或创建 |
| 0.3 | 修复 tools 包编译错误 | `@vitamin/tools` | P0 | index.ts 导出了不存在的 plan-create/get/list/update 源文件 |
| 0.4 | Orchestrator → coding 运行时接入 | `@vitamin/coding` | P0 | 当前 vitamin-app.ts 中编排回调是空实现 |

### Phase A — 基础增强（工具元数据 + 并发安全）

| 编号 | 任务 | 包 | 优先级 | 性质 | 说明 |
|------|------|-----|--------|------|------|
| A1 | Read-Only Tool Concurrency | `@vitamin/agent` | P0 | **代码层**（并发安全） | work-loop batch-then-serial |
| A2 | AgentTool.readonly 标记 | `@vitamin/tools` | P0 | **代码层**（工具固有属性） | 标记内置工具 readonly |
| A3 | System Prompt Section Caching | `@vitamin/coding` | P1 | **代码层**（性能优化） | prompt 按 section 增量组装 |

### Phase B — Prompt 层引导 + 工具能力暴露

| 编号 | 任务 | 包 | 优先级 | 性质 | 说明 |
|------|------|-----|--------|------|------|
| B1 | Phase Context Injection hook | `@vitamin/coding` | P0 | **Prompt 层** | system-prompt.transform 注入阶段上下文 |
| B2 | Complexity Routing 引导文本 | `@vitamin/coding` | P0 | **Prompt 层** | system prompt 中加入路由指引 |
| B3 | Review Guidance 引导文本 | `@vitamin/coding` | P0 | **Prompt 层** | system prompt 中加入 review 时机建议 |
| B4 | Reviewer AgentSpec 注册 | `@vitamin/orchestrator` | P1 | **配置层** | 注册 spec-reviewer / quality-reviewer |
| B5 | Lightweight Plan 工具 (write\_todos) | `@vitamin/tools` | P1 | **工具能力** | LLM 可调用的轻量规划工具 |

### Phase C — 模型绑定 + 状态能力

| 编号 | 任务 | 包 | 优先级 | 性质 | 说明 |
|------|------|-----|--------|------|------|
| C1 | ModelSlotResolver 后端 | `@vitamin/ai` | P0 | **代码层**（配置驱动映射） | slot→model 查表，无决策逻辑 |
| C2 | ModelSlotConfig 加入 Setting | `@vitamin/setting` | P1 | **配置层** | 对接 web-ui ModelSlot.tsx |
| C3 | capture\_file\_state 工具 | `@vitamin/memory` + `@vitamin/tools` | P1 | **工具能力** | LLM 主动触发文件状态快照 |
| C4 | File State Prompt 引导 | `@vitamin/coding` | P1 | **Prompt 层** | 引导 LLM 在上下文过长时使用快照 |

### Phase D — 经验学习

| 编号 | 任务 | 包 | 优先级 | 性质 | 说明 |
|------|------|-----|--------|------|------|
| D1 | OperationalLearningStore | `@vitamin/memory` | P1 | **代码层**（持久化） | 纯存储 + 语义搜索 |
| D2 | learn 工具注册 | `@vitamin/tools` | P1 | **工具能力** | LLM 调用记录经验 |
| D3 | Lesson Injection hook | `@vitamin/coding` | P2 | **Prompt 层** | system-prompt.transform 注入相关经验 |
| D4 | Session-end learning prompt | `@vitamin/coding` | P2 | **Prompt 层** | 会话结束时引导 LLM 总结经验 |

### 已废弃任务

| 原任务 | 废弃原因 |
|--------|----------|
| PhaseGateEngine | 工具守卫矩阵是硬编码决策，改为 Phase Context Injection (B1) |
| Task Complexity Auto-Classification | `classifyComplexity()` 是硬编码分类器，改为 Prompt 引导 (B2) |
| SubagentExecutor 固定管线 | 硬编码 implement→review 管线，改为 Review as Capability (B3+B4) |
| task\_delegate reviewMode 参数 | 不需要 reviewMode — LLM 自行决定是否 review |

---

## 五、架构影响分析

### 关键架构发现

1. **orchestrator 源码为空：** `packages/orchestrator/src/` 是空目录，`dist/` 也不存在。Phase 0.1 从零实现源码是全部后续工作的前置条件。

2. **dispatcher/plan 包缺失：** `orchestrator/package.json` 声明依赖 `@vitamin/dispatcher` 和 `@vitamin/plan`，但这两个包在 workspace 中 **不存在**。需要创建包骨架或移除依赖。

3. **coding 层无专用 lead session：** 当前使用通用 `agent-session.ts`，所有 prompt 逻辑通过 `system-prompt.transform` hook 分散实现。这实际上**符合新设计** — 不需要专用 LeadSession class，通过 hook 注入即可。

4. **orchestrator 需实现的能力：** FleetManager、PlanExecutor、CheckpointCoordinator 等均需从零开发，作为**工具能力**暴露给 LLM。

### 对现有 package 的变更影响

```
@vitamin/orchestrator                                         ★ 需从零实现
  └── [src/ 和 dist/ 均为空] 需实现：类型系统、TaskStore、Executor、
      FleetExecutor、CheckpointStore、AgentRegistry、EventBus、
      ToolCallbacks、OrchestratorFacade
  └── [待注册] spec-reviewer / quality-reviewer AgentSpec      [B4] 配置层

@vitamin/agent
  └── work-loop.ts: tool execution 改 batch-then-serial       [A1] 代码层（并发安全）
  └── types.ts: AgentTool 增加 readonly 字段                   [A2] 代码层（工具固有属性）

@vitamin/ai
  └── 新增 model-slots.ts: ModelSlotResolver                   [C1] 代码层（配置驱动查表）

@vitamin/tools
  └── 内置工具标记 readonly                                     [A2] 代码层
  └── 新增 write_todos 轻量 plan 工具                           [B5] 工具能力
  └── 新增 learn 经验记录工具                                   [D2] 工具能力
  └── 新增 capture_file_state 快照工具                          [C3] 工具能力

@vitamin/coding
  └── system-prompt.transform hook: phase annotation           [B1] Prompt 层
  └── system-prompt.transform hook: complexity guidance        [B2] Prompt 层
  └── system-prompt.transform hook: review guidance            [B3] Prompt 层
  └── system-prompt.transform hook: lesson injection           [D3] Prompt 层
  └── system-prompt.transform hook: file state guidance        [C4] Prompt 层
  └── prompt section caching                                   [A3] 代码层（性能）

@vitamin/memory
  └── 新增 file-state-snapshot.ts (FileStateManager)           [C3] 代码层（存储能力）
  └── 新增 operational-learning.ts (LearningStore)             [D1] 代码层（存储能力）

@vitamin/setting
  └── VitaminSetting schema 增加 modelSlots                     [C2] 配置层

@vitamin/dispatcher                                            ★ 待创建
@vitamin/plan                                                  ★ 待创建
```

### 变更分层统计

| 层 | 变更数 | 说明 |
|----|--------|------|
| **代码层** | 6 项 | readonly 并发、slot resolver、section caching、FileState/Learning store |
| **工具能力** | 3 项 | write\_todos、learn、capture\_file\_state |
| **配置层** | 3 项 | ModelSlotConfig、reviewer AgentSpec 注册、Setting schema |
| **Prompt 层** | 5 项 | phase/complexity/review/lesson/filestate 引导文本注入 |
| **已废弃** | 4 项 | PhaseGateEngine、SubagentExecutor、ComplexityRouter、reviewMode |

### 不变的核心抽象

以下核心抽象 **不需要更改**，新功能通过组合/扩展实现：

- `Agent` class & `workLoop()` 核心循环（只改 tool execution 并发策略）
- `HookRegistry` API（新功能通过注册新 hook 实现，31 hook 时机不变）
- `Session` 接口（DAG branching 模型不变）
- `EventBus` 事件模型（orchestrator 已有 26+ 事件类型，新增类型不改 API）
- `ProviderRegistry` / `StreamFunction`（slot resolver 在上层组合）
- **Orchestrator 公开接口**（已冻结：dispatchTask / createTask / executePlan / runFleet / suspend / resume / toToolCallbacks）

---

## 六、总结：Vitamin 对各框架的博采众长

> **核心策略：** 工具提供能力，Prompt 提供引导，LLM 做出决策。运行时代码仅处理安全约束（readonly 并发）和基础设施（存储、事件、hook 管线）。

| 框架 | 吸收的核心机制 | vitamin 实现方式 | 实现层 | 当前状态 |
|------|--------------|-----------------|--------|----------|
| **Superpowers** | Phase discipline + Two-stage review + Model selection | Phase annotation hook + Review as Capability + ModelSlotResolver | Prompt 层 + 工具层 + 配置层 | ❌ 未实现，hook/prompt 待建 |
| **Deep Agents** | Lightweight plan (write\_todos) + Sub-agent context isolation | `write_todos` 工具 + Ephemeral session policy | 工具层 + 配置层 | ❌ 工具未注册 |
| **InfiAgent** | File-State-as-Truth + Call graph context + Per-workflow model | `capture_file_state` 工具 + Subagent context injection + WorkflowSlot | 工具层 + Prompt 层 | ❌ 未实现，类型和工具待建 |
| **OpenDev** | 5 Workflow Slots + Agent Fleet + Section caching | LLM 在 dispatch 时指定 slot + FleetManager + prompt section cache | 大模型层 + 代码层 | ❌ 未实现，FleetManager 和 slot 待建 |
| **GStack** | Autoplan pipeline + Review Readiness + /learn | Prompt 引导 plan→review 流程 + `learn` 工具 | Prompt 层 + 工具层 | ❌ 未实现，PlanExecutor 和 learn 待建 |
| **Open Agent SDK** | Read-only concurrency + 4-layer permission + autoDream | readonly 标记 + batch-then-serial + hook 四层管线 + LearningStore | 代码层 | ❌ 未实现 |
| **Pi-mono** | TypeScript monorepo + Agent core + TUI 分离 | vitamin 现有架构已对齐 | — | ✅ 已对齐 |

### 与各框架的关键差异

| 维度 | 参考框架的做法 | vitamin 的差异化选择 |
|------|--------------|---------------------|
| Phase 执行 | Superpowers: SKILL.md 文本 / gstack: slash command 加载 | **同思路**：prompt 文本引导，不做代码守卫 |
| Complexity routing | Deep Agents: LLM 自然选择 write\_todos | **同思路**：prompt 描述三级路径，LLM 自行选择 |
| Review trigger | Superpowers: controller LLM 决定 / gstack: prompt 指导 | **同思路**：LLM 调用 `dispatchTask({category:'review'})` |
| Model selection | OpenDev: agent config 绑定 slot | **延伸**：LLM 也可在 dispatch 时指定 slot |
| Learning | gstack: /learn 是 slash command | **延伸**：`learn` 工具 + session 结束 prompt 提取 |
| Sub-agent delegation | InfiAgent: parent LLM 决定 | **同思路**：LLM 调用 dispatchTask，不做代码路由 |


