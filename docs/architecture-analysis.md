# Vitamin 架构综合分析：对标四大 AI Coding Agent 框架

> 说明
>
> - Superpowers、Deep Agents、Pi-mono 部分已额外交叉核对公开 README、示例或测试片段，但仍不属于逐行源码审计。
> - OpenDev 部分暂时只能基于公开产品材料做高层对比，证据强度弱于前三者。
> - Vitamin 部分优先依据当前仓库中的 README、设计文档和源码交叉校准；当 README 与实现不一致时，以当前实现边界为准。

## 一、四大框架概览对比

| 维度 | **Superpowers** | **Deep Agents** | **Pi-mono** | **OpenDev** | **Vitamin** |
|---|---|---|---|---|---|
| **语言** | Shell/JS (非框架,技能层) | Python (LangGraph) | TypeScript | Rust | TypeScript |
| **定位** | 技能/方法论插件 | SDK + CLI agent | AI agent toolkit + coding CLI | Rust terminal agent | 模块化 AI agent SDK |
| **架构模式** | Skill 驱动(提示词注入) | LangGraph 图状态机 | 分层 monorepo | 多 workflow 终端 agent | 分层注册表 monorepo |
| **核心思想** | 流程即 skill，强调工程流程 | Agent SDK + 中间件扩展 | 极简核心 + 强扩展 | compound AI (多模型/多工作流) | 分层抽象 + 钩子注入 |
| **多 Agent** | 子 agent 调度 + 评审 | `task` 工具(子 agent) | 默认单 agent，可通过扩展构建 | Agent Fleet (公开材料口径) | Orchestrator 构建块 + Lead 入口方向 |
| **上下文管理** | 手动隔离(每 task 新 agent) | 自动摘要/文件转存 | session 树 + compaction | Compaction stages (公开材料口径) | Memory 三层方案 |
| **工具系统** | 宿主 agent 原生工具 | read/write/edit/execute/task | 默认 read/write/edit/bash + 扩展工具 | 内置工具 + MCP (公开材料口径) | ToolRegistry + MCP/LSP 能力面 |
| **扩展点** | 写新 skill(.md) | 自定义 tools + middleware | extensions/skills/packages | MCP + workflow/model 配置 | HookRegistry/HookEngine + 31 个 hook timing |

---

## 二、各框架核心架构分解

### 2.1 Superpowers — 方法论驱动的 Skill 框架

```
┌───────────────────────────────────────┐
│   宿主 Agent (Claude Code/Cursor/Codex)│
│                                       │
│   ┌─────────────────────────────────┐ │
│   │  Skills 自动触发引擎            │ │
│   │  ├─ brainstorming (设计推敲)    │ │
│   │  ├─ writing-plans (计划编写)    │ │
│   │  ├─ subagent-driven-dev (分发)  │ │
│   │  ├─ test-driven-development     │ │
│   │  ├─ requesting-code-review      │ │
│   │  └─ finishing-branch            │ │
│   └─────────────────────────────────┘ │
│                                       │
│   工作流: brainstorm → plan → dispatch│
│   → implement → spec-review →         │
│   code-quality-review → merge         │
└───────────────────────────────────────┘
```

**核心流程**:
1. **Brainstorming** → 苏格拉底式需求推敲 → 输出设计文档
2. **Writing Plans** → 拆解为 2-5 分钟粒度的任务，附带具体文件路径和验证步骤
3. **Subagent Dispatch** → 每个任务分派独立子 agent → 实现者 + 规范审查 + 代码质量审查（三角色）
4. **TDD 强制** → RED-GREEN-REFACTOR，先写测试再实现
5. **Review Gates** → 两阶段评审（规范合规性 → 代码质量）
6. **Branch Finishing** → 测试验证 → merge/PR/discard 决策

**独特设计**: 它更接近**提示词级方法论**而不是运行时框架。通过 `.md` 文件注入宿主 agent，把工程流程前置到交互约束中；子 agent 通常以隔离上下文方式工作。

**本节公开锚点**:
- README 中的 The Basic Workflow / What's Inside，用来支撑“brainstorm → plan → subagent-driven-development → review → finishing-branch”的主流程判断。
- `skills/subagent-driven-development/SKILL.md`，用来支撑“两阶段 review、plan read once、controller 直接提供 task text、review loop”这些机制性判断。
- `docs/testing.md` 与 `tests/claude-code/test-subagent-driven-development-integration.sh`，用来支撑这套 workflow 不只是说明文，而是带有公开验证脚本。

---

### 2.2 Deep Agents (LangChain) — 图状态机 SDK

```
┌─────────────────────────────────────┐
│           create_deep_agent()       │
│  ┌────────────────────────────────┐ │
│  │     LangGraph Compiled Graph   │ │
│  │                                │ │
│  │  ┌──────────┐  ┌───────────┐  │ │
│  │  │ Planning  │  │ Filesystem│  │ │
│  │  │write_todos│  │ read/write│  │ │
│  │  │          │  │ edit/grep │  │ │
│  │  └──────────┘  └───────────┘  │ │
│  │  ┌──────────┐  ┌───────────┐  │ │
│  │  │  Shell   │  │Sub-agents │  │ │
│  │  │ execute  │  │  task()   │  │ │
│  │  └──────────┘  └───────────┘  │ │
│  │  ┌──────────────────────────┐  │ │
│  │  │  Context Management      │  │ │
│  │  │  auto-summarize          │  │ │
│  │  │  large-output → file     │  │ │
│  │  └──────────────────────────┘  │ │
│  └────────────────────────────────┘ │
│                                     │
│  Backends: LangSmith / Checkpointer │
│  Sandbox:  Daytona/Modal/QuickJS    │
└─────────────────────────────────────┘
```

**核心模块**:
- `libs/deepagents/` — SDK 核心: `create_deep_agent()`, middleware, backends
- `libs/cli/` — Textual TUI 交互终端
- `libs/acp/` — Agent Client Protocol
- `libs/evals/` — 评估套件
- `libs/partners/` — 沙箱集成 (Daytona, Modal, QuickJS, Runloop)

**核心流程**:
1. `create_deep_agent(model, tools, system_prompt)` → 编译 LangGraph 图
2. `agent.invoke(messages)` → 图执行循环
3. LLM 输出 → 工具调用解析 → 工具执行 → 结果回注 → 再次 LLM
4. 上下文过长 → 自动摘要/转存文件
5. `task()` 工具 → 子 agent 委派，隔离上下文窗口

**独特设计**: 基于 LangGraph 的**图状态机**让 streaming、persistence、checkpoint 更容易统一到同一执行模型里，`middleware` 机制则允许在图节点间注入自定义逻辑。

**本节公开锚点**:
- README overview / quickstart / LangGraph Native，用来支撑“batteries-included harness”“compiled LangGraph graph”“默认自带 planning/filesystem/subagent/context management”这些总判断。
- `libs/deepagents/deepagents/graph.py`，用来支撑默认工具面与 `create_deep_agent()` 的核心装配入口。
- `libs/deepagents/deepagents/middleware/subagents.py` 与 `libs/deepagents/deepagents/middleware/memory.py`，用来支撑 `task` 子 agent、AGENTS.md memory 和隔离上下文窗口这些判断。
- `libs/cli/deepagents_cli/app.py` / `textual_adapter.py`，用来支撑 CLI/TUI 是独立产品壳，而不是仅有 SDK。

---

### 2.3 Pi-mono — 极简核心 + 强扩展的 TypeScript Agent Toolkit

```
┌──────────────────────────────────────────────┐
│               pi-coding-agent                 │
│  默认工具: read / write / edit / bash        │
│  session: tree / fork / compact              │
├──────────────────────────────────────────────┤
│  扩展面: extensions / skills / prompts       │
│         themes / packages                    │
├──────────────────────────────────────────────┤
│  基础包: pi-ai / pi-agent-core / pi-tui      │
│         pi-web-ui / pi-mom / pi-pods         │
└──────────────────────────────────────────────┘
```

**公开文档能确认的核心点**:
- `pi-coding-agent` 是交互式 coding agent CLI，默认只给模型少量内置工具。
- session 是 JSONL 树结构，支持 `/tree`、fork 和 compaction。
- 自定义主要通过 extensions、skills、prompt templates、themes、pi packages 进行。
- README 明确强调：sub-agents、plan mode、MCP 都不是核心内置前提，而是留给扩展生态决定。

**独特设计**: Pi 的重点不是把所有高级能力默认做进核心，而是把核心保持得很薄，再用 TypeScript extension API 和 package 机制把工作流外移。这和 Vitamin 的“多包分层”思路接近，但 Pi 更偏产品壳 + 扩展生态，Vitamin 更偏 SDK 分层底座。

**本节公开锚点**:
- monorepo README 与 `packages/coding-agent/README.md`，用来支撑“minimal terminal coding harness”“默认工具面较薄”“sub-agents/plan mode/MCP 不作为核心内置前提”这些判断。
- `packages/coding-agent/docs/packages.md`，用来支撑 pi packages 作为 extensions/skills/prompts/themes 分发载体。
- `packages/coding-agent/examples/sdk/README.md` 与 `src/core/sdk.ts`，用来支撑 programmatic SDK、默认资源加载、默认工具集和可替换运行时装配面。
- `packages/coding-agent/examples/extensions/README.md` 与 `docs/extensions.md`，用来支撑 extension API 承担大部分高级能力扩展，而不是把这些能力全部塞进核心。

---

### 2.4 OpenDev — Compound AI 的 Rust Terminal Agent

```
┌──────────────────────────────────────────────┐
│              OpenDev TUI / Web UI             │
├──────────────────────────────────────────────┤
│   Workflow Slots                              │
│   Normal / Thinking / Compact / Critique / VLM│
├──────────────────────────────────────────────┤
│   Agent Fleet                                 │
│   并行子 agent + 独立上下文 + 独立模型绑定     │
├──────────────────────────────────────────────┤
│   Multi-provider + MCP                        │
└──────────────────────────────────────────────┘
```

**按公开材料可做的弱判断**:
- 按公开产品材料的术语，OpenDev 把执行、推理、压缩、自审、视觉拆成不同 workflow slot，并允许分别绑定不同 provider/model。
- 公开材料强调 Agent Fleet，可让多个子 agent 并行处理代码库的不同工作区域。
- 公开材料还反复提到 TUI、Web UI、MCP 与 multi-provider support。
- 当前未拿到足以支撑 crate 级拆解的稳定 README 或源码片段，因此这里只保留产品层对比，不把内部实现写死。

**独特设计**: OpenDev 最值得注意的不是某个具体内部模块，而是把“多模型分工”作为一等公民来设计：execution、thinking、compact、critique、vision 都是独立工作流槽位。这一点对 Vitamin 的启发价值高于它的具体 crate 划分。

---

## 三、Vitamin 架构分析（按当前文档校准）

### 3.1 架构分层

Vitamin 当前最清晰的结构不是“一个超大一体化 agent”，而是“应用容器 + 无状态执行引擎 + 编排层 + 基础设施包”的分层 monorepo。

```
Layer 8  ┌─────────────────────────────────────────────┐
(Entry)  │                @vitamin/cli                  │
         │  默认用户入口: vitamin.lead()                 │
         │  rpc 仍保留 session 级路径                    │
         └──────────────────┬──────────────────────────┘
                            │
Layer 7  ┌──────────────────▼──────────────────────────┐
(App)    │              @vitamin/coding                 │
         │  VitaminApp · AgentSession · LeadSession     │
         │  SettingsManager · ResourceManager           │
         │  PromptManager · CodingSessionManager        │
         └──────────────────┬──────────────────────────┘
                            │
Layer 6  ┌──────────────────▼──────────────────────────┐
(Orch)   │           @vitamin/orchestrator              │
         │  AgentRegistry · Dispatcher · BackgroundMgr  │
         │  PlanLoader / ReviewGate / RoutingStrategy   │
         │  关键策略已有接线点，但产品默认闭环仍待收口     │
         └──────────────────┬──────────────────────────┘
                            │
Layer 5  ┌─────────┬────────┴────────┬─────────────────┐
(Ext)    │ @vitamin │   @vitamin     │  @vitamin       │
         │ /hooks   │   /tools       │  /memory        │
         │ HookRegistry│ ToolRegistry │ L1 持久知识      │
         │ /HookEngine │ 预设工具层   │ L2 压缩          │
         │ 31 个 timing│ Skill 入口   │ L3 归档          │
         │            │                │                  │
         └─────────┴────────┬────────┴─────────────────┘
                            │
Layer 4  ┌──────────────────▼──────────────────────────┐
(Agent)  │              @vitamin/agent                  │
         │  消息外置的 Agent 执行引擎                     │
         │  work loop + steering/followUp + tool calls  │
         │  (持有 AgentState 但消息由调用方注入)          │
         └──────────────────┬──────────────────────────┘
                            │
Layer 3  ┌─────────┬────────┴────────┬──────────┬──────┐
(Infra)  │@vitamin │   @vitamin     │ @vitamin │@vita-│
         │/config  │   /ai          │ /session │min/  │
         │ JSONC   │ stream/cost/   │ File/    │dev-  │
         │ 合并/迁移│ provider/oauth │ Remote/  │tools │
         │ /监听    │ registry       │ Memory   │      │
         └─────────┴────────────────┴──────────┴──────┘
                            │
Layer 2  ┌──────────────────▼──────────────────────────┐
(Utils)  │             @vitamin/shared                  │
         │  Logger · TypedEventEmitter · FS · HTTP      │
         │  Error hierarchy · JSON/JSONC helpers        │
         └──────────────────┬──────────────────────────┘
                            │
Layer 1  ┌─────────┬────────┴──────────────────────────┐
(Base)   │@vitamin │              @vitamin              │
         │/env     │             /invariant             │
         │ 环境变量 │  断言与生产构建剥离                 │
         └─────────┴───────────────────────────────────┘
```

这里要特别区分“当前源码主链”和“README / 目标态叙事”：当前源码可以直接验证到 `SettingsManager`、`ResourceManager`、`PromptManager`、`CodingSessionManager`、`ToolRegistry`、`Orchestrator` 已进入 `VitaminApp.start()` 主路径；其他未接入这条主链的能力，不应写成默认 runtime 事实。

### 3.2 14 个包的职责与成熟度

| # | 包 | 核心职责 | 当前判断 |
|---|---|---|---|
| 1 | env | 环境变量与默认常量 | 基础包，职责单一明确 |
| 2 | invariant | 运行时断言与构建剥离 | 基础包，边界明确 |
| 3 | shared | 日志、FS、HTTP、错误、事件 | 公共底座 |
| 4 | config | JSONC 配置 schema、合并、迁移、watch | 基础设施成熟 |
| 5 | ai | 多 Provider 统一流式 LLM API | 核心基础设施成熟 |
| 6 | session | 泛型会话、分支、持久化、分页 | 基础设施成熟 |
| 7 | devtools | Atomics 同步暂停 + Worker 控制平面 + 调试命令协议 | 差异化能力明显，已支持断点暂停与恢复 |
| 8 | agent | 消息外置的执行引擎（持有 AgentState，消息由调用方注入） | 核心执行层成熟 |
| 9 | hooks | HookRegistry/HookEngine 与内置 hooks | 源码定义并导出 31 个 hook timing，能力边界清晰 |
| 10 | memory | 持久知识 + 压缩 + 归档 | 设计完整，偏基础设施层 |
| 11 | tools | 工具注册、预设、Skill 工具入口 | 工具面较完整 |
| 12 | orchestrator | 多 Agent 调度、计划、后台、Review 等 | 模块实现多，`review/retry/router` 已有接线点，但产品默认闭环未完全收口 |
| 13 | coding | 应用容器与产品入口装配 | 当前真正的产品集成中心 |
| 14 | cli | SDK 的命令行入口 | 默认用户入口已对齐 `vitamin.lead()`，但 README 与子命令能力仍偏薄 |

### 3.3 关键协作关系

Vitamin 的主干协作关系可以概括为：

1. coding 负责把 config、resources、prompt、sessions、tools、orchestrator 组合成应用容器；文档描述应与当前 `VitaminApp.start()` 已验证主链保持一致。
2. agent 负责一次 run 的执行，消息历史由调用方通过 AgentRunContext 注入；Agent 实例持有 AgentState（turnCount、tokenUsage、status），需调用 reset() 清零。
3. session 负责消息树、分支、压缩边界和持久化。
4. ai 负责 Provider 协议统一、流式事件、usage 和费用计算。
5. tools 暴露可调用的工具表面，编排相关工具大量采用“壳 + 回调注入”模式。
6. orchestrator 负责控制面，但更准确地说是“已具备大量构建块，且一部分高级能力已经进入运行时路径”，而不是“所有产品层闭环都已完成”。

---

## 四、Vitamin 三栏校准

把 Vitamin 的现状拆成“已接线且运行时生效 / 已实现但依赖显式注入或不是默认路径 / 目标态或仍待收口”三栏后，结论会更稳定。

| 主题 | 已接线且运行时生效 | 已实现但依赖显式注入或不是默认路径 | 目标态或仍待收口 |
|---|---|---|---|
| Lead prompt 与入口 | `VitaminApp.start()` 会先后构建初始与最终 lead prompt；`vitamin.lead()` 懒创建 `LeadSession` | lead 的 catalog 丰富度依赖 resources、tools、agent specs / orchestrator 是否装配完成 | CLI / UI 仍需把 lead 入口叙事进一步统一成默认用户心智 |
| Lead 与 orchestrator 联动 | `LeadSession` 当前只订阅 `task.created/task.completed/task.failed`，并把完成/失败任务摘要写入 `LeadResult.tasks` | 只有在 app 装配了 orchestrator 时这条事件回流链才存在；`plan.*` / `review.*` 仍未汇总到 `LeadResult` | 后续可把 task 生命周期、plan 生命周期、review 生命周期统一成更清晰的 lead 观测面 |
| Resources / Prompt Runtime | `SettingsManager`、`ResourceManager`、`PromptManager` 已进入 `VitaminApp.start()` 主链 | lead prompt 的 catalog 丰富度仍依赖 resources、tools、agent specs 等运行时装配 | 后续需要继续把“已实现 API”“默认主链”“推荐架构”三者明确拆开 |
| Agent / Session 分工 | Agent 持有执行状态，消息由 `AgentRunContext` 注入；Session 管消息树、分支和持久化 | 多会话/子会话复用语义需要上层显式选择 sticky/ephemeral | 如果以后引入更复杂 team/fleet，当前“消息外置”设计仍是可扩展基础 |
| Dispatcher 同步/后台执行 | `dispatcher.dispatch()` 同步路径、`BackgroundManager.submit()` 后台路径都已可工作；task 事件真实发射 | 并发上限、模型选择、路由与质量门禁都依赖 options 或 spec 配置 | 还没有形成默认对用户显式可见的“审查/恢复/升级”工作流壳 |
| Plan 执行 | `performWork(plan)` 已能 `load → buildStepPrompt → dispatch → checkpoint / planRun / markdown 回写` | 必须提供 `planFileStore` 才会启用；review 只有注入 `reviewGate` 时生效 | 仍未形成 `waiting_review → resume/fail` 这类完整审查状态机 |
| Review / Retry / Router / Clarify | `reviewGate`、`retryStrategy`、`circuitBreaker`、`router`、`clarifyChannel` 都有真实接线位；dispatcher/agent-registry/performWork 会消费它们 | 默认并不总是启用，取决于 `VitaminAppOptions` 或外部注入 | 产品层还没有把这些能力组织成统一、默认可见的高阶编排体验 |
| Devtools | 已具备 `Atomics.wait()` 同步暂停、Worker 控制平面、WebSocket 调试服务、断点管理、命令协议通道 | `step/over/stop` 已进入协议与传输层，但尚未映射为完整 Agent 单步/跨帧/停止语义 | 距离“完整 debugger”仍缺调用栈检查、变量求值、Agent 状态机级单步控制 |
| Hooks | 源码定义并导出 31 个 `HookTiming`，hooks/event bus 已在多处主路径接入 | 预置 hook 集合与 timing 总数不是一个概念，仍需在文档和 preset 说明里分清 | 还可以继续把 hooks 与产品层事件视图对应得更清楚 |
| Memory | L1/L2/L3 三层方案已经成型，能作为独立能力层理解 | 是否进入具体运行时链路，仍取决于应用装配与策略选择 | 还不能把它描述成“整个产品默认全链路启用的稳定记忆系统” |
| CLI / 产品壳 | CLI 当前已把 `modelId` 与项目级 config 路径接到 `VitaminApp`，`print/json/interactive` 默认走 `vitamin.lead()` | `rpc` 仍保留 session 级路径；doctor/config/auth 仍是占位子命令 | 默认产品壳仍需把 planning、review、clarify、recovery 串成统一体验 |

---

## 五、当前关键运行路径

### 5.1 当前可确认的单会话主路径

```
调用方
  → createAgentSession() 或 VitaminApp.createSession()
  → AgentSession.prompt()
  → Session.buildContext()
  → Agent.run({ model, systemPrompt, tools, messages })
  → ai.stream()
  → tool loop
  → assistant message 回写 Session
  → 持久化
```

这条链路的特点是：

1. 由 Session 负责上下文与消息树。
2. 由 Agent 负责执行循环。
3. 由 AI 层负责统一 Provider 流。
4. 由 Tools 层提供工具面。

### 5.2 当前可确认的 Lead 路径

```
createVitamin()
  → vitamin.start()
    → settings.load()
    → resourceManager.load()
    → build initial lead prompt
    → bootstrapToolsAndOrchestrator()
    → build final lead prompt
  → vitamin.lead(userPrompt)
    → 按需创建 LeadSession
    → LeadSession.run(userPrompt)
```

这里最关键的判断有三条：

1. lead prompt 的构建发生在 `start()`，不是入口示例文件里。
2. lead session 是懒创建的，所以只看 example 会误判成“似乎没有装配 lead prompt”。
3. 当前源码的 `start()` 主链聚焦 settings / resources / prompt / tools / orchestrator，因此文档不应把其他能力写成“已验证默认主路径”。

### 5.2.1 当前 CLI 默认用户入口

```
vitamin [prompt] / vitamin --json [prompt] / vitamin --interactive
  → createVitamin({ workspaceDir, projectConfigPath, modelId, ... })
  → app.start()
  → app.lead(prompt) / LeadInteractiveMode.handleInput()
```

这条路径说明了三件事：

1. CLI 默认用户路径现在已经直接把用户请求送进 `vitamin.lead()`，这和 `@vitamin/coding` README 的产品入口建议终于对齐了。
2. CLI 和 coding 的默认模型接线也保持一致：`--model` 会通过 `VitaminApp.modelId` 进入 `ModelRegistry.resolve()`，`--config` 会映射到 `projectConfigPath`。
3. 但这不等于“整个 CLI 已完全产品化闭环”：当前 `rpc` 仍保留 session 级路径，doctor/config/auth 也还不是完整产品能力。

### 5.2.2 LeadSession 当前复用语义

```
第一次 app.lead(prompt)
  → if !leadSession: createSession()
  → createLeadSession(session, orchestrator)
  → LeadSession.run(prompt)

后续 app.lead(prompt)
  → 复用同一 leadSession
  → LeadSession.run(prompt)
```

这条路径当前还有三个容易被文档写宽的边界：

1. `lead()` 在 `VitaminApp` 生命周期内是懒创建、单实例复用的；不是每次调用都重新创建新 lead session。
2. `LeadResult.tasks` 当前只会汇总 `task.completed` / `task.failed` 产生的任务摘要；`task.created` 只触发回调，`plan.*` / `review.*` 事件不会自动进入结果对象。
3. 因此当前 lead 已能观测子任务执行结果，但还不是一个完整的“计划执行 + 审查状态”观测面。

### 5.3 当前已进入运行时的编排路径

```
Lead 或底层调用方
  → orchestrator.dispatcher.dispatch()
  → AgentRegistry.resolve(name/category; router 为可选)
  → 创建或复用子会话（默认 ephemeral，sticky 需显式 sessionMode）
  → session.prompt(task.prompt)
  → 可选 ReviewGate / RetryStrategy / CircuitBreaker
  → task.completed / task.failed / task.cancelled
```

这条路径已经足以支撑：

- 底层链路验证
- 回调注入式工具调用
- 同步/后台子任务执行
- 默认隔离上下文且只把 task prompt 注入子会话
- sticky/ephemeral child session 语义，以及成功/失败后的子会话清理
- 在注入相应依赖时执行 review、retry、circuit-breaker、策略路由

更具体地说，只有同时提供 `sessionMode: 'sticky'`、`sessionId`，并且 `SessionFactory.getSession()` 可用时，dispatcher 才会尝试复用已有 child session；否则仍会新建隔离子会话并在结束后清理。

但如果写成下面这种强断言就会失真：

- “ReviewGate 已在所有任务路径中默认生效”
- “路由/重试/熔断已经默认参与所有产品主路径”
- “任务会进入 waiting_review 并等待审查后恢复”
- “lead 产品链路和 orchestrator 高阶能力已经全部闭环”

### 5.4 当前已闭环的计划执行路径

```
工具或上层调用方
  → performWork(plan.md)
  → planLoader.load(plan)
  → getNextStep() / buildStepPrompt()
  → dispatcher.dispatch(stepPrompt)
  → 可选 ReviewGate
  → checkpointStore.save()
  → planRunStore.save()
  → planLoader.save() 回写 markdown 进度
```

这条链已经不是“未来设计图”，而是当前源码中真实存在的 plan 执行子路径；而且测试已经覆盖 step 推进、`plan.started/plan.step_completed/plan.completed` 事件和 checkpoint 写入。但它仍有明确边界：

- 只有提供 `planFileStore` 时这条路径才会启用
- review 失败时直接标记 step 为 `failed`
- 当前没有进入 `waiting_review` 的状态流转

### 5.5 Memory 路径的正确理解

Memory 文档说明 Vitamin 的目标形态是三层记忆：

1. L1 Persistent Memory：多源 AGENTS.md 与项目知识注入
2. L2 Compaction：Prune + Summarize
3. L3 History Archive：被压缩消息归档并可恢复

这是完整而清晰的设计，但在外部介绍时，应把它表述为“memory 包的分层方案”，而不是武断宣称“整套产品运行时已自动、稳定、全链路启用三层记忆”。

---

## 六、Vitamin 的综合判断

### 6.1 Vitamin 已经明确领先或有特色的地方

1. 包级拆分非常清晰，`ai`、`session`、`tools`、`config`、`memory` 都可以独立成立。
2. lead prompt 两阶段运行时装配比静态 system prompt 更贴近真实产品状态。
3. agent 消息外置、session 有状态的分工足够干净，利于多会话和子会话隔离。Agent 持有 AgentState（turnCount、tokenUsage），但消息由调用方注入。
4. tools 采用预设分层和回调注入，既方便裁剪能力面，也方便让 orchestrator 接管控制面。
5. devtools 已具备 Atomics 同步暂停、断点管理和调试命令协议通道，这是当前 Vitamin 一个比较少见的差异化能力，但仍未达到完整 debugger 水平。

### 6.2 Vitamin 当前还不应夸大的地方

1. CLI 默认用户入口虽然已经切到 `vitamin.lead()`，但公开文档和子命令能力仍然偏基础，不能按成熟产品 CLI 去写。
2. orchestrator 的很多高阶能力已经部分接线，但仍不能等同于产品默认链路已完全闭环。
3. devtools 已有调试命令通道，但尚未实现调用栈检查或变量求值，不能写成"完整 debugger"。
4. hooks 的对外描述应区分“31 个 timing 定义”和“预置 hook 示例集合”，避免把 timing 总数与预置 hook 实例数量混写成同一个指标。

---

## 七、修订后的总判断

Vitamin 的核心竞争力不在于“今天已经把所有高阶能力都串到产品入口里”，而在于它已经搭出了一个边界清晰、职责分层合理、扩展点丰富的 TypeScript agent 平台底座。

更准确地说，Vitamin 当前处于下面这个阶段：

1. 基础设施层已经很强：`ai`、`session`、`config`、`shared`、`agent` 都有清晰边界。
2. 应用容器层已经成形：`coding` 把 lead、resources、settings、sessions 组织起来了。
3. 编排层构建块非常丰富：`orchestrator` 已经不只是概念设计，而是有大量已实现模块。
4. 真正还需要推进的是“高阶编排能力接入产品主路径”的最后一公里。

如果用一句话概括 Vitamin 当前状态：

> 它已经不是一个零散的 AI agent 实验仓库，而是一个有明确产品方向的分层 SDK；真正的短板不在基础层，而在 orchestrator 和产品入口之间的运行时闭环仍需继续收口。

---

## 八、Vitamin vs 四框架的建议落地矩阵

这一节直接回答“哪些优势值得融入 Vitamin，哪些不值得”。判断标准不是“外部项目做了什么就都抄进来”，而是看它是否和 Vitamin 当前的分层边界、TypeScript SDK 定位、已有运行时装配方式相匹配。

| 来源 | 借鉴点 | 是否建议融入 | 优先级 | 更适合落点 | 原因与边界 |
|---|---|---|---|---|---|
| Superpowers | brainstorm → plan → review 的默认工程流程 | 建议融入 | P0 | `@vitamin/coding` lead prompt + 默认 orchestrator 工作流 | Vitamin 目前缺的不是底层能力，而是默认方法论；这一点最值得产品化 |
| Superpowers | 双阶段 review（spec compliance → code quality） | 建议部分融入 | P1 | `ReviewGate` + lead prompt 契约 | Vitamin 已有 `ReviewGate`，缺的是默认用户路径和更稳定的状态流转 |
| Superpowers | 强制 TDD/测试先行 workflow | 建议部分融入 | P2 | 文档、prompt、review 规则 | 适合作为默认建议或严格模式，不适合硬编码成所有场景唯一流程 |
| Superpowers | git worktree / branch-finishing 这种强流程工作法 | 不建议内建到核心 SDK | P3 | CLI 扩展、技能或外部工具 | 这是非常具体的操作流，适合作为产品壳或技能，不适合进入底层核心包 |
| Deep Agents | 子 agent 的隔离上下文执行 | 已部分具备，建议继续加强 | P1 | `dispatcher`、child session mode、prompt contract | Vitamin 已有 isolated child session 语义，可以继续强化默认隔离与结果格式 |
| Deep Agents | graph runtime / LangGraph 式编排模型 | 不建议照搬 | - | 不适用 | Vitamin 当前已走分层 SDK 路线，直接迁移到图运行时会破坏现有边界 |
| Deep Agents | sandbox/provider adapters for execution | 建议融入 | P2 | tools 执行层、shell/file tool 安全边界 | 对 Vitamin 有现实价值，尤其适合提升工具执行安全性 |
| Pi-mono | preset / package 生态 | 建议融入 | P1 | `coding` 资源加载、工具装配、包发现机制 | Vitamin 已有多包和 hooks 基础，缺的是更标准化的分发与生态接口 |
| Pi-mono | 极简默认工具面 | 建议部分吸收 | P2 | CLI preset / app 默认配置 | Vitamin 核心已经模块化，不必追求更薄的架构，但可让默认产品入口更克制 |
| Pi-mono | “很多能力不要内建” 的哲学 | 不建议整体照搬 | - | 不适用 | Vitamin 的差异化就在编排与控制面，不能为了极简把优势一起削掉 |
| OpenDev | workflow slot 式多模型分工（execution / thinking / compact / critique / VLM） | 强烈建议融入 | P0 | `@vitamin/ai`、config、orchestrator | 这和 Vitamin 现有分层高度契合，是最值得吸收的结构性优势之一 |
| OpenDev | Agent Fleet / 并行子 agent | 建议融入 | P1 | orchestrator、background manager、lead workflow | Vitamin 已有后台和调度基础，扩成并行 fleet 的成本相对低 |
| OpenDev | TUI + Web UI 的产品壳 | 建议部分融入 | P3 | CLI / devtools / 上层应用 | 有产品价值，但不应优先于默认编排体验和工作流产品化 |
| OpenDev | Rust 级性能路线 | 不建议作为近期方向 | - | 不适用 | Vitamin 的价值在 SDK 分层与生态，不在同一赛道上拼语言运行时性能 |

### 8.1 从矩阵推导出的落地顺序

如果只按“收益 / 与现有架构的贴合度 / 实现成本”排序，最值得推进的不是把 Vitamin 变成另一个 CLI 产品，而是先把下面三件事做实：

1. 把 Superpowers 风格的默认工作流做进 lead 与 orchestrator 的产品默认路径。
2. 把 OpenDev 风格的 workflow-slot 多模型分工引入配置层和执行层。
3. 把 Pi-mono 风格的 preset / 包生态标准化，让外部能力更容易接入。

### 8.2 是否需要 Agent Team

结论不是“立刻做一个复杂 agent team 平台”，而是：

- **需要继续加强 multi-agent / child-agent 能力**，因为 Vitamin 的 orchestrator、child session、background task 已经具备基础。
- **不需要一开始就追求复杂组织学意义上的 agent team**，例如层层 manager/worker/reviewer/critic 的完整社会化模拟。

更合理的路径是：

1. 先把 lead + isolated child session + review gate + performWork 形成默认闭环。
2. 再把并行 fleet 和多模型 workflow slot 加进去。
3. 最后再考虑更复杂的 team 编排语义是否真的有必要产品化。

换句话说，Vitamin 更需要的是“默认多代理工作流”，而不是先做“复杂 agent 组织系统”。

### 8.3 P0 / P1 实施路线图

如果把上一节的判断落成真正可执行的版本，建议不要按“框架来源”排任务，而要按 Vitamin 自己的架构层次排任务。更合适的拆法是三段推进：先收口默认工作流，再引入多模型分工，最后标准化 preset / package 生态。

| 阶段 | 核心目标 | 主要改动面 | 预期结果 |
|---|---|---|---|
| Phase 1 | 把默认工作流产品化 | `coding`、`orchestrator`、`tools` | lead 默认走 brainstorm → plan → execute → review 闭环 |
| Phase 2 | 引入 workflow-slot 多模型分工 | `ai`、`config`、`orchestrator` | execution / planning / critique 等角色有独立模型槽位 |
| Phase 3 | 标准化 preset 与 package 生态 | `coding`、`tools`、`hooks`、CLI | 外部包、工具集、prompt preset 能稳定发现、加载、组合 |

### 8.4 Phase 1: 默认工作流产品化

这一阶段对应 Superpowers 对 Vitamin 最有价值的部分，但不是去复制它的 git/worktree 流程，而是把它的默认工程方法论落到 Vitamin 当前的产品入口上。

建议拆成四步：

1. **固定 lead 默认阶段模型**
  把 lead 输出收敛为明确阶段，例如 `clarify → brainstorm → plan → execute → review → finalize`，而不是让 prompt 只给方向、不定义状态。
2. **把 plan 与 dispatch 关系收口成默认路径**
  让 `performWork` 不再只是“存在的一条 plan 执行子路径”，而是 lead 在识别到复杂任务时的默认执行器。
3. **把 review gate 做成默认体验而不是可选能力**
  先做最小双阶段 review：结果是否完成需求、实现质量是否达标；失败时给出 retry 或 clarify 分支，而不是直接停在内部状态里。
4. **把 child session 使用规则显式化**
  规定什么任务默认开 ephemeral child session，什么任务才允许 sticky session，避免 multi-agent 语义只存在于底层 API。

这一步最适合落到下面这些包：

| 包 | 建议改动 |
|---|---|
| `@vitamin/coding` | lead prompt contract、阶段定义、默认任务分类与默认编排入口 |
| `@vitamin/orchestrator` | plan/review/retry/clarify 状态流转、默认 dispatch policy |
| `@vitamin/tools` | 让 plan / work / review 相关工具有更稳定的默认工具束 |
| `@vitamin/session` | child session 生命周期策略暴露得更清楚 |

这一阶段的完成标准应该是：

1. 新用户只走 `vitamin.lead()` 也能稳定进入统一工作流。
2. 复杂任务会默认进入 `plan → execute → review`，而不是完全依赖调用方自行拼装。
3. review 失败后，系统能给出 retry 或 clarify，而不是只留下内部失败状态。

### 8.5 Phase 2: workflow-slot 多模型分工

这一阶段主要吸收 OpenDev 的优势，而且和 Vitamin 现有结构高度兼容，因为 Vitamin 已经有 `ai`、`config`、`orchestrator` 三层分离。

建议把“模型选择”从单一 `model` 参数提升为 role-based slot：

| slot | 用途 | 更适合接入的位置 |
|---|---|---|
| `execution` | 主执行、工具调用、写代码 | `dispatcher` 默认执行链 |
| `planning` | 生成任务分解、步骤计划 | lead / `performWork` 起始阶段 |
| `critique` | review、反思、失败重试前判断 | `ReviewGate`、retry 决策点 |
| `compact` | 长上下文压缩、摘要 | session / memory 压缩路径 |
| `vision` | 图片或多模态理解 | tools / provider capability 路由 |

实现顺序建议是：

1. 先在 `config` 里定义 workflow slots schema。
2. 再在 `ai` 里实现 slot → model/provider resolution。
3. 最后在 `orchestrator` 和 `coding` 里把 planning/review/execute 等阶段改用 slot 取模，而不是每条链路自己传模型。

这一阶段的边界也要写清楚：

- 不是先做复杂 graph runtime。
- 不是先做任意 agent 之间的自由协商。
- 只是先把“哪个阶段用哪个模型”从 prompt 习惯变成正式配置能力。

完成标准应该是：

1. 同一个任务可稳定区分 execution model 与 critique model。
2. 低成本模型可以承担 compact / summarize，而不是占用主执行模型预算。
3. provider fallback 逻辑开始能以 slot 为单位表达，而不是只对单模型做兜底。

### 8.6 Phase 3: 标准化 preset 与 package 生态

这一阶段主要吸收 Pi-mono 的长处，但不复制它的“尽量不内建”哲学。Vitamin 已经有较完整的核心层，真正缺的是标准化生态接口。

建议优先做三件事：

1. **统一 preset 发现机制**
  把 resources、tool bundles、prompt presets、hooks presets 的发现与加载约定统一起来。
2. **定义外部 package 的最小 manifest**
  让一个外部包可以显式声明自己提供哪些 tools、prompts、hooks、skills 或 resources。
3. **把默认产品壳和 package 生态解耦**
  默认 CLI/app 保持克制，但允许通过 preset 快速切换“工程型”“研究型”“轻量型”等工作模式。

更适合承接的包是：

| 包 | 建议改动 |
|---|---|
| `@vitamin/coding` | preset 入口、资源装配 |
| `@vitamin/tools` | 工具束 manifest、命名空间和版本约束 |
| `@vitamin/hooks` | hooks preset 与外部包的挂接约定 |
| CLI | preset 选择、诊断命令 |

这一阶段的完成标准应该是：

1. 外部包不改核心代码也能稳定接入一组工具和 prompt。
2. 用户可以通过 preset 快速切到不同工作模式。
3. 文档能清晰回答“如何发布一个 Vitamin preset 包”。

### 8.7 推荐实施顺序与依赖关系

这三个阶段不适合并行硬推，比较合理的依赖关系是：

1. **先做 Phase 1**，因为默认工作流不收口，多模型和 preset / package 生态都会缺少稳定挂点。
2. **再做 Phase 2**，因为 workflow slot 需要明确的阶段边界才能落地。
3. **最后做 Phase 3**，因为 preset / package 生态最好建立在已经稳定的工作流接口之上。

如果压缩成一句话，就是：

> 先定义默认工作流，再定义每个阶段用什么模型，最后定义外部包怎么把能力插进这些阶段。

---

## 九、后续写作建议

后续如果继续扩展这份文档，建议始终把 Vitamin 的描述拆成三栏：

1. 已落地且已接入运行时
2. 已实现但尚未接线
3. 推荐架构与目标态

这样可以避免把 README 中的“实现状态快照”“推荐入口”“未来闭环方向”混写成单一事实层，降低误导风险。

---

## 十、Vitamin 关键结论的证据映射

下面列的是本文里最关键的 Vitamin 判断，以及可直接回查的仓库证据位置。

| 结论 | 证据位置 | 备注 |
|---|---|---|
| lead prompt 采用两阶段运行时装配 | [packages/coding/docs/lead-flow.md](../packages/coding/docs/lead-flow.md)；[packages/coding/src/app/vitamin-app.ts](../packages/coding/src/app/vitamin-app.ts)；[packages/coding/tests/lead-session.test.ts](../packages/coding/tests/lead-session.test.ts) | 说明 prompt 不是静态常量，而是 runtime artifact；测试还验证了最终 prompt 会进入 lead model 调用 |
| `vitamin.lead()` 是推荐产品入口，dispatcher 更偏内部控制面 | [packages/coding/README.md](../packages/coding/README.md) | 用于区分产品入口与底层编排 API |
| `VitaminApp.lead()` 首次调用懒创建 `LeadSession`，后续调用复用同一会话 | [packages/coding/src/app/vitamin-app.ts](../packages/coding/src/app/vitamin-app.ts)；[packages/coding/tests/lead-session.test.ts](../packages/coding/tests/lead-session.test.ts) | 用于区分“推荐入口”与“当前 lead 会话生命周期” |
| `VitaminApp.start()` 当前可直接验证的主链是 settings / resources / prompt / tools / orchestrator | [packages/coding/src/app/vitamin-app.ts](../packages/coding/src/app/vitamin-app.ts)；[packages/coding/src/index.ts](../packages/coding/src/index.ts) | 用于区分当前 runtime 主链与 README / 目标态叙事 |
| `reviewGate`、`retryStrategy`、`circuitBreaker`、`router` 已进入 orchestrator 装配参数 | [packages/coding/src/app/vitamin-app.ts](../packages/coding/src/app/vitamin-app.ts)；[packages/coding/src/app/types.ts](../packages/coding/src/app/types.ts) | 证明这些能力并非纯概念模块 |
| dispatcher 已实际消费 `reviewGate`、`retryStrategy`、`circuitBreaker` | [packages/orchestrator/src/dispatcher.ts](../packages/orchestrator/src/dispatcher.ts) | 证明它们已经进入真实执行路径 |
| dispatcher 默认为每个子任务创建隔离 child session，并在非 sticky 路径结束后清理 | [packages/orchestrator/src/dispatcher.ts](../packages/orchestrator/src/dispatcher.ts)；[packages/orchestrator/tests/orchestrator.test.ts](../packages/orchestrator/tests/orchestrator.test.ts) | 用于支撑“默认 ephemeral、sticky 需显式请求”的判断 |
| `performWork` 在提供 `reviewGate` 时会执行 review | [packages/orchestrator/src/orchestrator.ts](../packages/orchestrator/src/orchestrator.ts) | 说明 plan 路径已有质量门禁接线 |
| `performWork` 在提供 `planFileStore` 时会发出 `plan.started/plan.step_completed/plan.completed` 并写 checkpoint | [packages/orchestrator/src/orchestrator.ts](../packages/orchestrator/src/orchestrator.ts)；[packages/orchestrator/tests/perform-work.test.ts](../packages/orchestrator/tests/perform-work.test.ts) | 说明 plan 路径不仅存在，而且已有 runtime 事件与恢复锚点 |
| `router` 会在 `AgentRegistry.resolve()` 中参与策略路由 | [packages/orchestrator/src/agent-registry.ts](../packages/orchestrator/src/agent-registry.ts) | 说明策略路由不是 README-only 能力 |
| `waiting_review` 目前仍主要停留在状态模型里 | [packages/orchestrator/src/types.ts](../packages/orchestrator/src/types.ts) | 当前未见完整 runtime 状态流转 |
| LeadSession 当前只订阅 `task.created/task.completed/task.failed`，并把任务摘要回流到 `LeadResult.tasks` | [packages/coding/src/lead/lead-session.ts](../packages/coding/src/lead/lead-session.ts)；[packages/coding/tests/lead-session.test.ts](../packages/coding/tests/lead-session.test.ts) | 说明 lead 与 orchestrator 已有真实联动，但观测面仍主要停留在 task 级 |
| CLI 默认用户入口已经直接调用 `vitamin.lead()`；`rpc` 仍保留 session 级路径 | [packages/cli/src/cli.ts](../packages/cli/src/cli.ts)；[packages/coding/src/modes/lead-modes.ts](../packages/coding/src/modes/lead-modes.ts)；[packages/cli/tests/cli.test.ts](../packages/cli/tests/cli.test.ts)；[packages/coding/README.md](../packages/coding/README.md) | 用于区分“默认用户入口已对齐”和“仍存在内部 session 级路径” |
| `VitaminApp` 已提供 `modelId` 字符串入口，CLI 的 `--model` 通过 `ModelRegistry` 解析，`--config` 接到 `projectConfigPath` | [packages/coding/src/app/types.ts](../packages/coding/src/app/types.ts)；[packages/coding/src/app/vitamin-app.ts](../packages/coding/src/app/vitamin-app.ts)；[packages/cli/src/cli.ts](../packages/cli/src/cli.ts)；[packages/coding/tests/lead-agent.test.ts](../packages/coding/tests/lead-agent.test.ts) | 说明 CLI / coding 默认装配路径已重新对齐到可运行状态，且已有 `modelId` 回归测试 |
| devtools 已有暂停、断点、命令协议和传输通道，但 README 仍将其界定为最小调试基础设施 | [packages/devtools/README.md](../packages/devtools/README.md)；[packages/devtools/src/protocol.ts](../packages/devtools/src/protocol.ts)；[packages/devtools/src/service-worker.ts](../packages/devtools/src/service-worker.ts)；[packages/devtools/src/tools/breakpoints.ts](../packages/devtools/src/tools/breakpoints.ts)；[packages/devtools/src/service.ts](../packages/devtools/src/service.ts) | 用于界定“真实能力上限”和“README 默认叙事”的差异 |
| hooks 的 timing 总数应以源码导出的 31 个 `HookTiming` 为准 | [packages/hooks/src/types.ts](../packages/hooks/src/types.ts)；[packages/hooks/src/hook-registry.ts](../packages/hooks/src/hook-registry.ts) | 用于区分 timing 总数与预置 hook 集合 |

---

## 十一、外部框架来源边界

这一节不是要把外部项目写成“已完成源码审计”，而是说明本文比较时各自依赖的公开依据强弱。

1. **Superpowers**: 主要依据公开 README 的 Basic Workflow/What's Inside，以及 `skills/subagent-driven-development/SKILL.md`、`docs/testing.md`、`tests/claude-code/test-subagent-driven-development-integration.sh` 这些公开文件。能较稳定支撑“skill 驱动流程”“两阶段 review”“测试验证 workflow”这类判断。
2. **Deep Agents**: 主要依据公开 README、`libs/deepagents/deepagents/graph.py`、`libs/deepagents/deepagents/middleware/*.py`、`libs/cli/deepagents_cli/*.py` 等公开仓库片段。能较稳定支撑“LangGraph compiled graph”“默认内置 planning/filesystem/execute/task”“memory/skills/subagents/CLI-TUI 并存”这类判断。
3. **Pi-mono**: 主要依据公开 monorepo README、`packages/coding-agent/README.md`、`packages/coding-agent/docs/packages.md`、SDK/examples 与 extension 示例。能较稳定支撑“核心保持轻量”“默认工具面较薄”“扩展、skills、packages 承担大量工作流能力”这类判断。
4. **OpenDev**: 当前没有拿到足够稳定的 README 或源码片段来支撑 crate 级拆解，因此本文只保留公开产品术语层面的对比，例如 workflow slot、Agent Fleet、TUI/Web UI、MCP、多 provider。任何更深入的内部实现判断，都应等待直接仓库审计后再写。

