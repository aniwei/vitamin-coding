# Vitamin 架构综合分析：对标四大框架 × 全模块流程详解

> 基于 Superpowers (121k⭐)、Deep Agents (18k⭐)、Pi-mono (28.7k⭐)、OpenDev (441⭐) 四大框架
> 综合分析 Vitamin 14 个模块的架构设计、运行时流程与简化路径

---

## 一、四大框架速览与核心差异

### 1.1 框架定位一览

| 框架 | 语言 | 定位 | 核心理念 | 模块化程度 |
|---|---|---|---|---|
| **Superpowers** | Shell/JS | 技能/方法论插件 | 流程即 skill，注入宿主 agent | 低（skill 文件集合） |
| **Deep Agents** | Python | SDK + CLI agent | LangGraph 图状态机 + middleware | 中（libs monorepo） |
| **Pi-mono** | TypeScript | Agent toolkit + coding CLI | 极简核心 + 强扩展 | 中（7 packages） |
| **OpenDev** | Rust | 高性能终端 agent | 多 workflow slot × 多模型 | 高（20+ crates） |
| **Vitamin** | TypeScript | 分层 AI agent SDK | 注册表驱动 + 钩子注入 | 高（14 packages） |

### 1.2 架构模式对比

```
Superpowers:  Prompt Injection → 宿主 Agent 原生循环
              ┌──────────────────────────────┐
              │ .md Skills 自动触发           │
              │ brainstorm → plan → dispatch  │
              │ → TDD → review → finish      │
              └──────────────────────────────┘

Deep Agents:  LangGraph Compiled Graph → 状态机循环
              ┌──────────────────────────────┐
              │ create_deep_agent()           │
              │ Node → Tool → SubAgent → Node│
              │ + Middleware + Checkpointer   │
              └──────────────────────────────┘

Pi-mono:      Thin Core → Extension Ecosystem
              ┌──────────────────────────────┐
              │ coding-agent (薄壳)           │
              │ + extensions + skills + pkgs  │
              │ + pi-ai + pi-agent-core      │
              └──────────────────────────────┘

OpenDev:      Workflow Slots × Agent Fleet
              ┌──────────────────────────────┐
              │ Normal/Thinking/Compact/      │
              │ Critique/VLM 独立绑模型       │
              │ + Agent Fleet 并行执行        │
              └──────────────────────────────┘

Vitamin:      Registry-Driven Layered SDK
              ┌──────────────────────────────┐
              │ ModelRegistry + ProviderReg   │
              │ + HookRegistry + ToolRegistry │
              │ + AgentRegistry + Dispatcher  │
              │ + Session Tree + Memory层     │
              └──────────────────────────────┘
```

---

## 二、Vitamin 14 个模块详细解析

### 2.1 架构分层图

```
═══════════════════════════════════════════════════════════
Layer 8  CLI 入口
─────────────────────────────────────────────────────────
         @vitamin/cli
         命令行 REPL，解析用户输入，调用 coding 层
═══════════════════════════════════════════════════════════
Layer 7  应用容器
─────────────────────────────────────────────────────────
         @vitamin/coding
         VitaminApp · CodingSessionManager · AgentSession
         LeadSession · PromptManager · ResourceManager
═══════════════════════════════════════════════════════════
Layer 6  编排层
─────────────────────────────────────────────────────────
         @vitamin/orchestrator
         Dispatcher · AgentRegistry · BackgroundManager
         PlanLoader · ReviewGate · RoutingStrategy
═══════════════════════════════════════════════════════════
Layer 5  能力扩展层
─────────────────────────────────────────────────────────
         @vitamin/hooks      @vitamin/tools      @vitamin/memory
         31 hook timings     ToolRegistry        L1 持久知识
         HookEngine          预设工具集          L2 压缩
         Preset 系统         Skill/MCP/LSP       L3 归档
═══════════════════════════════════════════════════════════
Layer 4  执行引擎
─────────────────────────────────────────────────────────
         @vitamin/agent
         workLoop · ToolExecutor · Steering/FollowUp
         AgentState · 15 种事件 · transformContext
═══════════════════════════════════════════════════════════
Layer 3  基础设施
─────────────────────────────────────────────────────────
         @vitamin/ai       @vitamin/session    @vitamin/config    @vitamin/devtools
         ModelRegistry      Session Tree        JSONC Config       断点暂停
         ProviderRegistry   Branching           Store/Watcher      Worker 控制
         stream()           Compaction          Migration          调试协议
         EventStream        持久化                                  
═══════════════════════════════════════════════════════════
Layer 2  公共工具
─────────────────────────────────────────────────────────
         @vitamin/shared
         Logger · TypedEventEmitter · FS · HTTP · Error · JSON
═══════════════════════════════════════════════════════════
Layer 1  基座
─────────────────────────────────────────────────────────
         @vitamin/env              @vitamin/invariant
         环境变量 · 默认常量        运行时断言 · 生产剥离
═══════════════════════════════════════════════════════════
```

### 2.2 各模块职责与关键 API

#### Layer 1: 基座

| 模块 | 职责 | 关键导出 | 依赖 |
|---|---|---|---|
| **@vitamin/env** | 环境变量集中管理与默认常量 | `ENV`, `defaults` | 无 |
| **@vitamin/invariant** | 开发期断言，生产构建自动剥离 | `invariant()`, `assert()` | 无 |

#### Layer 2: 公共工具

| 模块 | 职责 | 关键导出 | 依赖 |
|---|---|---|---|
| **@vitamin/shared** | 日志、事件、文件系统、HTTP、错误体系、JSON/JSONC 工具 | `Logger`, `TypedEventEmitter`, `FSAdapter`, `HttpClient`, `BaseError` | env |

#### Layer 3: 基础设施

| 模块 | 职责 | 关键导出 | 依赖 |
|---|---|---|---|
| **@vitamin/ai** | 多 Provider LLM 统一接口：模型解析、流式推理、费用计算 | `ModelRegistry.resolve()`, `ProviderRegistry.get()`, `stream()`, `EventStream` | shared |
| **@vitamin/session** | 会话存储、消息树、分支、上下文构建、可选摘要化 | `Session`, `SessionStore` (file/remote/memory), `buildContext()`, `branchAt()` | shared, env |
| **@vitamin/config** | JSONC 配置 schema、合并、版本迁移、文件监听 | `ConfigStore`, `ConfigWatcher`, `VitaminConfigSchema` | shared |
| **@vitamin/devtools** | Atomics 同步暂停、Worker 控制平面、WebSocket 调试、断点管理 | `BreakpointManager`, `DebugProtocol`, `ServiceWorker` | shared |

#### Layer 4: 执行引擎

| 模块 | 职责 | 关键导出 | 依赖 |
|---|---|---|---|
| **@vitamin/agent** | 无状态（消息外置）turn-based 执行循环 | `Agent.run()`, `workLoop()`, `ToolExecutor`, `AgentState`, `steering`/`followUp` 队列 | ai, shared |

**Agent 核心机制**:
- **消息外置**: Agent 不持有消息历史，由调用方通过 `AgentRunContext` 注入
- **AgentState**: 持有 turnCount、tokenUsage、status（需 `reset()` 清零）
- **Steering 队列**: 工具执行中途可注入消息（中断当前内循环）
- **FollowUp 队列**: Turn 边界注入（如自动追问）
- **15 种事件**: status_change, turn_start, turn_end, tool_call_start, tool_call_end, stream_event 等

#### Layer 5: 能力扩展层

| 模块 | 职责 | 关键导出 | 依赖 |
|---|---|---|---|
| **@vitamin/hooks** | 31 个 hook timing 的注册/执行引擎 | `HookRegistry.on()`, `HookEngine.execute()`, presets (default/strict/minimal/none) | shared |
| **@vitamin/tools** | 工具注册、验证、预设集合 | `ToolRegistry.register()`, `ToolCallbacks`, 分类: Binary/FS/LSP/MCP/Search/Shell/Session/Skill/Orchestration | shared |
| **@vitamin/memory** | 三层记忆：持久知识 → 压缩 → 归档 | `PersistentMemory`, `Compactor`, `ArchiveStore`, token budgeting | shared, ai |

**Hooks 31 个 Timing 分类**:
```
── 消息生命周期 ──
chat.message.before / chat.message.after
messages.transform (修改发送前消息数组)
chat.params (自定义 temp/maxTokens/thinkingLevel)

── 工具执行 ──
tool.execute.before / tool.execute.after

── 流处理 ──
stream.start / stream.end

── 上下文管理 ──
compaction.before / compaction.after
system-prompt.transform

── 任务编排 ──
task.created / task.started / task.completed / task.failed
task.cancelled / task.recovered
plan.started / plan.step_completed / plan.completed
review.requested / review.passed / review.failed
... (共 31 个)
```

**Tools 回调注入机制**:
```
ToolCallbacks = {
  dispatchTask()    → 分派子任务到 orchestrator
  callAgent()       → 直接调用指定 agent
  performWork()     → 执行计划文件
  createTask()      → 创建编排任务
  loadSkill()       → 加载 skill 提示词
}
```

#### Layer 6: 编排层

| 模块 | 职责 | 关键导出 | 依赖 |
|---|---|---|---|
| **@vitamin/orchestrator** | 任务分派、Agent 路由、后台执行、计划管理、质量门禁 | `Dispatcher`, `AgentRegistry`, `BackgroundManager`, `PlanLoader`, `ReviewGate`, `EventBus` | agent, session, tools, shared |

**Dispatcher 核心能力**:
- 同步执行 (`executeSyncTask`)
- 后台异步执行 (`BackgroundManager.submit()`)
- 可选 `ReviewGate` (质量评审)
- 可选 `RetryStrategy` (失败重试)
- 可选 `CircuitBreaker` (熔断保护)
- 可选 `Router` (AgentRegistry 策略路由)

**Plan 执行路径**:
```
performWork(plan.md)
  → planLoader.load(plan)
  → getNextStep()
  → buildStepPrompt()
  → dispatcher.dispatch(stepPrompt)
  → 可选 ReviewGate
  → checkpointStore.save()
  → planRunStore.save()
  → planLoader.save() 回写 markdown 进度
```

#### Layer 7: 应用容器

| 模块 | 职责 | 关键导出 | 依赖 |
|---|---|---|---|
| **@vitamin/coding** | 多会话应用容器、Lead 入口、资源装配 | `VitaminApp`, `CodingSessionManager`, `AgentSession`, `LeadSession`, `PromptManager`, `ResourceManager` | 几乎所有包 |

**VitaminApp 启动装配流程**:
```
VitaminApp.start()
  ├─ settings.load()         → 加载配置
  ├─ resourceManager.load()  → 加载 AGENTS.md、prompt 模板
  ├─ build initial lead prompt
  ├─ bootstrapToolsAndOrchestrator()
  │   ├─ 注册内置工具 + 用户注入工具
  │   └─ 初始化调度器
  └─ build final lead prompt → 完成系统提示词装配
```

**LeadSession 特性**:
- 懒创建（首次 `vitamin.lead()` 时实例化）
- 订阅 orchestrator 的 task.created/completed/failed 事件
- 解析返回结果的状态行: done / done_with_concerns / needs_context / blocked

#### Layer 8: CLI 入口

| 模块 | 职责 | 关键导出 | 依赖 |
|---|---|---|---|
| **@vitamin/cli** | 命令行入口与 lead / session 模式装配 | `runCli()`, `parseCLI()`, `printHelp()` | coding |

---

## 三、Vitamin 核心运行时流程

### 3.1 主流程：以 Lead/API 路径为例的用户输入 → AI 响应

```
┌─────────────────────────────────────────────────────────┐
│            用户输入（以 VitaminApp.lead() 路径为例）       │
└────────────────────────┬────────────────────────────────┘
                         ▼
┌─────────────────────────────────────────────────────────┐
│             VitaminApp.lead(userPrompt)                   │
│  ┌─────────────────────────────────────────────────────┐ │
│  │ LeadSession.run(userPrompt)                          │ │
│  │  ├─ 订阅 orchestrator eventBus                       │ │
│  │  └─ 调用 AgentSession.prompt()                       │ │
│  └──────────────────────┬──────────────────────────────┘ │
└─────────────────────────┼────────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────┐
│           AgentSession.prompt(text)                       │
│  1. Hook: chat.message.before (可取消/修改)              │
│  2. Session.append(userMessage)                          │
│  3. Session.buildContext() → {messages, summary?}        │
│  4. Hook: chat.params (自定义温度/token/思考级别)         │
│  5. Hook: messages.transform (修改消息数组)               │
└─────────────────────────┬────────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────┐
│              Agent.run(context)                           │
│  ┌─────────────────────────────────────────────────────┐ │
│  │            workLoop() 核心循环                        │ │
│  │                                                      │ │
│  │  ┌─────────────────────────────────────────────┐     │ │
│  │  │ 1. transformContext() [压缩/注入]             │     │ │
│  │  │ 2. stream(model, provider, context, signal)  │     │ │
│  │  │    → Provider async 循环                     │     │ │
│  │  │    → EventStream 收集缓冲事件                 │     │ │
│  │  │ 3. 提取 AssistantMessage                     │     │ │
│  │  │ 4. messages.push(assistantMessage)           │     │ │
│  │  └──────────────────┬──────────────────────────┘     │ │
│  │                     ▼                                 │ │
│  │         ┌── 有 tool_calls? ──┐                       │ │
│  │         │ Yes                │ No                     │ │
│  │         ▼                    ▼                        │ │
│  │  ┌─────────────┐    ┌──────────────┐                │ │
│  │  │ 工具执行循环  │    │ 检查 followUp │                │ │
│  │  │ ┌──────────┐│    │ stop_reason?  │                │ │
│  │  │ │Hook:tool │││    └──────┬───────┘                │ │
│  │  │ │.before   │││           │                        │ │
│  │  │ │→validate │││    end_turn → 结束                  │ │
│  │  │ │→execute  │││                                    │ │
│  │  │ │Hook:tool │││                                    │ │
│  │  │ │.after    │││                                    │ │
│  │  │ │→push     │││                                    │ │
│  │  │ │ result   │││                                    │ │
│  │  │ └──────────┘││                                    │ │
│  │  │ check steer ││                                    │ │
│  │  └──────┬──────┘│                                    │ │
│  │         └───────→ 回到 loop 顶部                      │ │
│  └─────────────────────────────────────────────────────┘ │
└─────────────────────────┬────────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────┐
│               返回 AssistantMessage                       │
│  1. Session 持久化                                       │
│  2. LeadSession.parseLeadResult()                        │
│     → 提取: done | done_with_concerns | needs_context    │
│  3. Hook: chat.message.after                             │
│  4. 输出给用户                                           │
└─────────────────────────────────────────────────────────┘
```

### 3.2 编排流程：Lead 委派子 Agent

```
Lead Agent 识别到需要委派任务
         │
         ▼
┌─────────────────────────────────────────────────────────┐
│ Tool: dispatchTask({ prompt, subagent, mode })           │
└────────────────────────┬────────────────────────────────┘
                         ▼
┌─────────────────────────────────────────────────────────┐
│           Orchestrator.dispatcher.dispatch()              │
│  1. 创建 OrchestratorTask { id, kind, status, input }   │
│  2. AgentRegistry.resolve(name/category)                 │
│     └─ 可选: Router 策略路由                              │
│  3. EventBus → task.created                              │
└────────────────────────┬────────────────────────────────┘
                         │
              ┌──────────┴──────────┐
              │                     │
              ▼                     ▼
     ┌────────────────┐   ┌────────────────────┐
     │  mode='sync'   │   │  mode='background'  │
     │                │   │                      │
     │executeSyncTask │   │BackgroundManager     │
     │  ├ createChild │   │  .submit()          │
     │  │ Session     │   │  → async queue      │
     │  ├ agent.run() │   │  → 独立执行          │
     │  ├ capture out │   │  → taskId 返回       │
     │  └ return      │   └──────────┬───────────┘
     └───────┬────────┘              │
             │                       │
             ▼                       ▼
     ┌─────────────────────────────────────────┐
     │  可选质量门禁:                            │
     │  ├─ ReviewGate    → 评审结果             │
     │  ├─ RetryStrategy → 失败重试             │
     │  └─ CircuitBreaker → 熔断保护            │
     └───────────────────┬─────────────────────┘
                         ▼
     ┌─────────────────────────────────────────┐
     │  EventBus → task.completed / task.failed │
     │  LeadSession 收集 TaskSummary            │
     │  Lead Agent 继续后续处理                  │
     └─────────────────────────────────────────┘
```

### 3.3 计划执行流程

```
┌─────────────────────────────────────────────────────────┐
│ Tool: performWork(plan.md)                               │
└────────────────────────┬────────────────────────────────┘
                         ▼
┌─────────────────────────────────────────────────────────┐
│  PlanLoader.load(plan)                                   │
│  → 解析 markdown → 提取步骤列表                           │
│  → 恢复 checkpoint（如有）                                │
└────────────────────────┬────────────────────────────────┘
                         ▼
         ┌───────── Step Loop ─────────┐
         │                              │
         ▼                              │
┌─────────────────────────────┐         │
│ getNextStep()               │         │
│ → 跳过已完成的步骤           │         │
│ → 返回下一个待执行步骤       │         │
└──────────────┬──────────────┘         │
               ▼                        │
┌─────────────────────────────┐         │
│ buildStepPrompt(step)       │         │
│ → 组装步骤上下文与指令       │         │
└──────────────┬──────────────┘         │
               ▼                        │
┌─────────────────────────────┐         │
│ dispatcher.dispatch(prompt)  │         │
│ → 子 Agent 执行具体步骤      │         │
└──────────────┬──────────────┘         │
               ▼                        │
┌─────────────────────────────┐         │
│ 可选: ReviewGate 评审        │         │
│ → pass → 标记 step ✓        │         │
│ → fail → 标记 step ✗        │         │
└──────────────┬──────────────┘         │
               ▼                        │
┌─────────────────────────────┐         │
│ checkpointStore.save()      │         │
│ planRunStore.save()         │         │
│ planLoader.save() 回写进度   │         │
└──────────────┬──────────────┘         │
               │                        │
               └────────────────────────┘
                    还有下一步?

         所有步骤完成 → 返回结果
```

### 3.4 上下文压缩流程

```
AgentSession.prompt()
  → Session.buildContext()
  → 计算消息 token 总量
         │
         ▼
  token 总量 > 阈值?
    │ No → 直接返回完整消息
    │ Yes ↓
    ▼
┌─────────────────────────────────────────┐
│ Hook: compaction.before                  │
│                                          │
│ Memory.compact()                         │
│  ├─ L1: PersistentMemory                │
│  │   → AGENTS.md / 项目知识注入         │
│  │                                       │
│  ├─ L2: Compaction                       │
│  │   → 调用模型: "summarize these..."    │
│  │   → 旧消息 → 1 条摘要消息             │
│  │   → 释放 token 空间                   │
│  │                                       │
│  └─ L3: Archive                          │
│      → 被压缩消息归档存储                 │
│      → 支持后续恢复查询                   │
│                                          │
│ Hook: compaction.after (记录统计)         │
└─────────────────────────────────────────┘
```

### 3.5 Hook 拦截流程

```
任意运行时事件触发
         │
         ▼
┌─────────────────────────────────────────┐
│ HookEngine.execute(timing, input, output)│
│                                          │
│  1. 查找该 timing 下所有注册 handlers    │
│  2. 按优先级排序                         │
│  3. 依次执行:                            │
│     handler₁(input, output) → 可修改 output
│     handler₂(input, output) → 可修改 output
│     handler₃(input, output) → 可取消/中断
│  4. 返回最终 output                      │
│                                          │
│  示例:                                   │
│  ┌─ chat.message.before ──────────────┐  │
│  │ input: { message, sessionId }      │  │
│  │ output: { message, cancelled }     │  │
│  │ → 可修改 message 内容              │  │
│  │ → 可设 cancelled=true 阻止发送     │  │
│  └────────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

### 3.6 会话分支流程

```
用户: "换个方案试试"
         │
         ▼
┌─────────────────────────────────────────┐
│ Session.branchAt(messageId)              │
│                                          │
│  消息树结构:                              │
│                                          │
│  root                                    │
│   ├─ user: "实现功能A"                   │
│   ├─ assistant: "方案1..."              │
│   ├─ user: "继续"                       │
│   ├─ assistant: "实现..."  ← 分支点      │
│   │   ├─ [branch-1] (原路径继续)         │
│   │   │  ├─ user: "有 bug"              │
│   │   │  └─ assistant: "修复..."        │
│   │   └─ [branch-2] (新分支)            │
│   │      ├─ user: "换个方案试试"         │
│   │      └─ assistant: "方案2..."       │
│   ...                                    │
│                                          │
│  → 新分支从分支点后开始                   │
│  → 历史消息保留不变                       │
│  → 后续 prompt() 在新分支上执行           │
└─────────────────────────────────────────┘
```

---

## 四、框架 × Vitamin 模块对照矩阵

### 4.1 模块级对照

| Vitamin 模块 | Superpowers 对应 | Deep Agents 对应 | Pi-mono 对应 | OpenDev 对应 |
|---|---|---|---|---|
| **@vitamin/env** | — | — | — | opendev-config (部分) |
| **@vitamin/invariant** | — | — | — | — |
| **@vitamin/shared** | — | langchain-core utils | — | opendev-http 等 |
| **@vitamin/ai** | (宿主 agent 提供) | init_chat_model | pi-ai | opendev-models |
| **@vitamin/session** | (宿主管理) | Checkpointer | session 树 (JSONL) | opendev-history |
| **@vitamin/config** | — | — | — | opendev-config |
| **@vitamin/devtools** | — | — | — | — (**Vitamin 独有**) |
| **@vitamin/agent** | (宿主 agent) | LangGraph graph | pi-agent-core | opendev-agents |
| **@vitamin/hooks** | — | Middleware | — | opendev-hooks |
| **@vitamin/tools** | (宿主工具) | read/write/edit/execute/task | 默认工具 + extensions | opendev-tools-* |
| **@vitamin/memory** | (无) | auto-summarize | compaction | opendev-memory |
| **@vitamin/orchestrator** | skills 工作流 | task() 子 agent | (无内置) | opendev-agents (fleet) |
| **@vitamin/coding** | — | CLI app | pi-coding-agent | opendev-cli |
| **@vitamin/cli** | — | CLI (Textual TUI) | coding-agent CLI | opendev-repl/tui |

### 4.2 能力维度对照

| 能力维度 | Superpowers | Deep Agents | Pi-mono | OpenDev | **Vitamin** |
|---|---|---|---|---|---|
| **多模型支持** | 宿主决定 | `init_chat_model()` 任意 | 多 provider | workflow slot 多模型 | ModelRegistry + ProviderRegistry |
| **流式推理** | 宿主提供 | LangGraph streaming | 内置 | 内置 | EventStream 统一协议 |
| **工具验证** | 无 | Zod/Pydantic | 无 | 内置 | Zod schema 验证 |
| **上下文压缩** | 隔离子 agent | auto-summarize | session compaction | Compact workflow | Memory 三层 + Hook |
| **子 Agent 隔离** | 每 task 新 agent | `task()` 隔离窗口 | 无内置 | Fleet 独立上下文 | Child Session (ephemeral/sticky) |
| **计划执行** | writing-plans + executing-plans | write_todos | 无内置 | — | PlanLoader + performWork |
| **质量评审** | requesting-code-review (两阶段) | — | — | Critique workflow | ReviewGate (可选) |
| **失败重试** | — | — | — | — | RetryStrategy + CircuitBreaker |
| **断点调试** | — | — | — | — | **Atomics 暂停 + 协议** |
| **钩子系统** | — | Middleware | — | hooks | **31 timing HookEngine** |
| **扩展生态** | .md Skill 文件 | tools + middleware | extensions + packages | MCP + plugins | tools + hooks + MCP |

---

## 五、简化流程总览

### 5.1 Vitamin 全局简化流程图

```
┌─────────────────── Vitamin 运行时全景 ───────────────────┐
│                                                          │
│  ① 启动                                                 │
│  VitaminApp.start()                                      │
│    → 加载配置 (config)                                   │
│    → 加载资源 (AGENTS.md, prompts)                       │
│    → 注册工具 (内置 + 用户注入)                          │
│    → 初始化编排器 (orchestrator)                          │
│    → 装配系统提示词 (lead prompt)                         │
│                                                          │
│  ② 用户交互（推荐产品/API 路径）                         │
│  vitamin.lead(userPrompt)                                │
│    → LeadSession.run()                                   │
│      → AgentSession.prompt()                             │
│                                                          │
│  ③ 执行循环                                              │
│  Agent.run() → workLoop()                                │
│    → stream() → AI 推理                                  │
│    → 工具调用? → ToolExecutor.execute()                  │
│    → 继续循环直到 end_turn                               │
│                                                          │
│  ④ 编排委派 (如需)                                       │
│  dispatchTask() → Dispatcher                             │
│    → AgentRegistry 路由 → 子 Session                     │
│    → 子 Agent 执行 → 结果回流                            │
│                                                          │
│  ⑤ 计划执行 (如需)                                       │
│  performWork(plan) → PlanLoader                          │
│    → Step Loop → dispatch 每步 → 检查点                  │
│                                                          │
│  ⑥ 上下文管理 (自动)                                     │
│  token 超限 → Memory.compact()                           │
│    → 摘要替换 → 归档 → 释放空间                          │
│                                                          │
│  ⑦ 返回结果                                              │
│  AssistantMessage → Lead 路径下 parse status → 输出      │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

补充：当前 CLI 的 `print/json/interactive` 默认已经走 lead 路径；上面的流程图描述的正是当前默认用户主路径。`rpc` 仍保留 session 级内部路径。

### 5.2 七步简化流程

| 步骤 | 阶段 | 核心动作 | 涉及模块 |
|---|---|---|---|
| **①** | **启动** | 配置加载 → 资源加载 → 工具注册 → 编排初始化 → 提示词装配 | cli, coding, config, tools, orchestrator |
| **②** | **接收** | 用户输入 → Hook 拦截 → 消息入会话树 → 构建上下文 | coding, hooks, session |
| **③** | **推理** | context → stream() → Provider 调用 → EventStream 事件 | agent, ai |
| **④** | **工具** | tool_calls 解析 → Hook 拦截 → Zod 验证 → 执行 → 结果回注 | agent, tools, hooks |
| **⑤** | **编排** | 识别委派需求 → Dispatcher 路由 → 子 Session 执行 → 结果收集 | orchestrator, session, agent |
| **⑥** | **压缩** | token 超限 → 摘要生成 → 消息替换 → 归档 | memory, session, ai |
| **⑦** | **输出** | 最终消息 → 解析状态 → 持久化 → Hook 通知 → 返回用户 | coding, session, hooks |

### 5.3 数据流简化图

```
用户输入
  │
  ▼
[Hook: chat.message.before] ─── 可取消 ──→ 中止
  │
  ▼
Session.append() → 消息树
  │
  ▼
buildContext() ──→ token 超限? ──→ Memory.compact()
  │                                    │
  ▼                                    ▼
Agent.workLoop()                    摘要替换
  │
  ├──→ stream(model, provider, context)
  │         │
  │         ▼
  │    EventStream ──→ AssistantMessage
  │         │
  │         ▼
  │    有 tool_calls?
  │    │ Yes              │ No
  │    ▼                  ▼
  │  [Hook: tool.before]  检查 followUp
  │    │                  │
  │    ▼                  ▼
  │  ToolExecutor         stop_reason
  │    │                  = end_turn?
  │    ▼                  │ Yes
  │  [Hook: tool.after]   ▼
  │    │                返回结果
  │    ▼
  │  结果 → messages
  │    │
  │  检查 steering ──→ 有注入? → 中断内循环
  │    │
  │    ▼
  │  回到 stream()
  │
  ▼
返回 AssistantMessage
  │
  ▼
[Hook: chat.message.after]
  │
  ▼
Session.persist() → 持久化
  │
  ▼
输出给用户
```

---

## 六、对标分析：Vitamin 的结构性优势与差距

### 6.1 Vitamin 独有或领先的能力

| 能力 | 说明 | 对标框架中的状况 |
|---|---|---|
| **Atomics 断点调试** | devtools 已实现同步暂停 + Worker 控制平面 + 调试协议 | 四个框架均无此能力 |
| **31 timing Hook 系统** | 粒度细致的全生命周期拦截，支持 preset 切换 | Deep Agents 有 middleware 但粒度较粗；其余无 |
| **消息外置 Agent 设计** | Agent 不持有消息，由调用方注入，天然支持多会话/子会话 | Pi-mono 类似；Deep Agents 由图管理；其余不适用 |
| **ToolCallbacks 注入** | 工具执行通过回调注入编排能力，不硬编码依赖 | Deep Agents 工具自包含；Superpowers 依赖宿主 |
| **三层 Memory 设计** | L1 持久知识 + L2 压缩 + L3 归档，分层清晰 | Deep Agents 有 auto-summarize；Pi-mono 有 compaction |
| **14 包精细拆分** | 每层职责明确，可独立使用 | OpenDev 20+ crates 更多但语言不同；其余拆分较粗 |

### 6.2 Vitamin 与最佳实践的差距

| 维度 | 最佳实践来源 | Vitamin 当前状态 | 建议 |
|---|---|---|---|
| **默认工程流程** | Superpowers | 缺少默认 brainstorm → plan → review 闭环 | 将工作流写入 lead prompt 默认路径 |
| **多模型 workflow slot** | OpenDev | 单一模型配置，无角色化 slot | 引入 execution/planning/critique/compact slot |
| **子 Agent 隔离规范** | Deep Agents | 有 child session 但无默认隔离策略 | 规范化 ephemeral/sticky 选择规则 |
| **扩展包标准** | Pi-mono | 有 hooks/tools 但无标准 manifest | 定义扩展包 manifest 与发现机制 |
| **Review 状态机** | Superpowers | ReviewGate 可选但无 waiting_review 流转 | 补全评审状态机 |
| **沙箱执行** | Deep Agents | 无内置沙箱 | 考虑工具执行安全边界 |

---

## 七、推荐简化路径：三阶段收口

### Phase 1: 默认工作流产品化 (最高优先)

**目标**: 让 `vitamin.lead()` 默认走完整工程流程

```
当前状态:
  vitamin.lead() → AgentSession.prompt() → 自由对话

目标状态:
  vitamin.lead() → 需求澄清 → 任务分解
    → plan 生成 → 步骤执行 → 质量评审 → 结果汇总

改动范围:
  @vitamin/coding   → lead prompt 定义阶段模型
  @vitamin/orchestrator → plan/review 默认策略
  @vitamin/tools    → 默认工具束绑定
  @vitamin/session  → child session 生命周期显式化
```

### Phase 2: Workflow Slot 多模型分工

**目标**: 不同阶段可绑定不同模型

```
当前状态:
  所有阶段使用同一个 model 参数

目标状态:
  config:
    slots:
      execution: "github-copilot/gpt-4.1"
      planning:  "github-copilot/o3-mini"
      critique:  "github-copilot/gpt-4o"
      compact:   "github-copilot/gpt-4.1-mini"

改动范围:
  @vitamin/config → slot schema 定义
  @vitamin/ai     → slot → model/provider 解析
  @vitamin/orchestrator → 阶段取模改用 slot
```

### Phase 3: 标准化扩展生态

**目标**: 外部包可稳定接入工具、prompt、hooks

```
当前状态:
  扩展通过代码注入，无标准格式

目标状态:
  扩展包 manifest:
    {
      name: "my-extension",
      tools: [...],
      hooks: [...],
      prompts: [...],
      skills: [...]
    }

改动范围:
  @vitamin/coding → 扩展发现与加载
  @vitamin/tools  → 工具束 manifest
  @vitamin/hooks  → hooks preset 挂接
  @vitamin/cli    → preset 选择命令
```

### 三阶段依赖关系

```
Phase 1 (默认工作流)
    │
    │ 需要稳定的阶段边界
    ▼
Phase 2 (多模型 slot)
    │
    │ 需要稳定的工作流接口
    ▼
Phase 3 (扩展生态)
```

> **核心原则**: 先定义默认工作流 → 再定义每阶段用什么模型 → 最后定义外部包怎么插入这些阶段

---

## 八、依赖关系总图

```
@vitamin/cli
    └──→ @vitamin/coding
              ├──→ @vitamin/orchestrator
              │         ├──→ @vitamin/agent ──→ @vitamin/ai ──→ @vitamin/shared
              │         ├──→ @vitamin/session ──→ @vitamin/env
              │         └──→ @vitamin/tools
              ├──→ @vitamin/hooks
              ├──→ @vitamin/memory ──→ @vitamin/ai
              ├──→ @vitamin/config
              ├──→ @vitamin/devtools
              └──→ @vitamin/session

@vitamin/shared ──→ @vitamin/env
@vitamin/invariant (独立，构建期使用)
```

---

## 九、总结

### Vitamin 的当前定位

Vitamin 是一个 **注册表驱动的分层 AI Agent SDK**，其核心竞争力在于:

1. **14 包精细分层** — 各层职责清晰，可独立使用或组合
2. **注册表模式** — ModelRegistry / ProviderRegistry / HookRegistry / ToolRegistry / AgentRegistry 统一驱动
3. **消息外置设计** — Agent 无状态执行，天然支持多会话与子会话隔离
4. **31 timing Hook 系统** — 全生命周期细粒度拦截
5. **Atomics 断点调试** — 业内独有的 Agent 调试能力

### 与四大框架的定位差异

```
Superpowers → 方法论（不是框架，是流程注入）
Deep Agents → SDK + 产品（图状态机 + CLI）
Pi-mono     → 产品 + 生态（薄核心 + 强扩展）
OpenDev     → 性能产品（Rust + 多模型 compound）
Vitamin     → 分层 SDK（TypeScript + 注册表 + Hook）
```

### 最关键的一句话

> Vitamin 的短板不在基础层 — AI/Session/Agent/Config 都已成熟 — 而在 **orchestrator 的高阶编排能力接入产品默认路径的最后一公里**。先收口默认工作流，其余自然跟上。
