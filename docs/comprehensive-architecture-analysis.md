# Vitamin 架构综合分析：对标四大 AI Coding Agent 框架

> 基于 Superpowers (121k⭐)、Deep Agents (18k⭐)、Pi-mono (28.7k⭐)、OpenDev (441⭐) 四大框架
> 综合分析 Vitamin 14 个模块的架构设计、对比各框架运行时流程、整理简化流程图

---

## 一、四大框架深度解构

### 1.1 定位与技术栈速览

| 维度 | **Superpowers** | **Deep Agents** | **Pi-mono** | **OpenDev** | **Vitamin** |
|---|---|---|---|---|---|
| 语言 | Shell/JS/Markdown | Python (LangGraph) | TypeScript | Rust | TypeScript |
| Stars | 121k | 18k | 28.7k | 441 | — |
| 定位 | 技能/方法论插件 | SDK + CLI agent harness | Agent toolkit + coding CLI | 高性能终端 compound agent | 分层 AI agent SDK |
| 架构核心 | Skill 驱动提示词注入 | LangGraph 图状态机 | 极简有状态核心 + 扩展生态 | 多 workflow slot × Agent Fleet | 注册表驱动 + 钩子注入 |
| Agent 状态模型 | 宿主 agent 管理 | LangGraph 图节点 | Agent 有状态(持有 messages) | 有状态 + workflow 分发 | 消息历史外置，执行状态内置 |
| 模块数 | ~15 skills (文件集合) | ~8 libs | 7 packages | 20+ crates | 14 packages |

### 1.2 架构模式对比图

```
╔══════════════════════════════════════════════════════════════════════════════╗
║  Superpowers — Prompt Injection × Skill 驱动                               ║
║  ┌──────────────────────────────────────────────────────────────┐           ║
║  │ 宿主 Agent (Claude Code / Cursor / Codex / Gemini CLI)      │           ║
║  │  ┌────────────────────────────────────────────────────────┐  │           ║
║  │  │ Skills 自动触发:                                        │  │           ║
║  │  │  brainstorming → writing-plans → subagent-driven-dev   │  │           ║
║  │  │  → test-driven-development → requesting-code-review    │  │           ║
║  │  │  → finishing-a-development-branch                      │  │           ║
║  │  └────────────────────────────────────────────────────────┘  │           ║
║  │  Skills = .md 文件 → 注入宿主 agent 的提示词空间             │           ║
║  │  无自己的运行时，完全依赖宿主的工具和执行能力                 │           ║
║  └──────────────────────────────────────────────────────────────┘           ║
╚══════════════════════════════════════════════════════════════════════════════╝

╔══════════════════════════════════════════════════════════════════════════════╗
║  Deep Agents — LangGraph 图状态机                                          ║
║  ┌──────────────────────────────────────────────────────────────┐           ║
║  │ create_deep_agent(model, tools, system_prompt)               │           ║
║  │  → 编译 LangGraph Graph                                     │           ║
║  │  ┌─────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐  │           ║
║  │  │ Planning │   │Filesystem│   │  Shell   │   │Sub-agent │  │           ║
║  │  │write_todo│   │read/write│   │ execute  │   │  task()  │  │           ║
║  │  │         │   │edit/grep │   │          │   │          │  │           ║
║  │  └─────────┘   └──────────┘   └──────────┘   └──────────┘  │           ║
║  │  + Middleware 管道 (memory, subagents, compaction)            │           ║
║  │  + Checkpointer (持久化) + LangSmith (追踪)                  │           ║
║  └──────────────────────────────────────────────────────────────┘           ║
╚══════════════════════════════════════════════════════════════════════════════╝

╔══════════════════════════════════════════════════════════════════════════════╗
║  Pi-mono — 有状态 Agent 核心 + 强扩展生态                                   ║
║  ┌──────────────────────────────────────────────────────────────┐           ║
║  │ pi-coding-agent (产品壳)                                     │           ║
║  │  ├─ 默认工具: read / write / edit / bash                     │           ║
║  │  ├─ session: JSONL 树 / fork / compaction                    │           ║
║  │  └─ 扩展面: extensions / skills / packages / themes          │           ║
║  ├──────────────────────────────────────────────────────────────┤           ║
║  │ pi-agent-core (有状态 Agent)                                 │           ║
║  │  ├─ Agent 类持有 messages + state                            │           ║
║  │  ├─ agentLoop: prompt → stream → tool_call → toolResult → 循环│          ║
║  │  ├─ steering / followUp 队列                                 │           ║
║  │  ├─ beforeToolCall / afterToolCall 钩子                      │           ║
║  │  └─ parallel / sequential 工具执行模式                       │           ║
║  ├──────────────────────────────────────────────────────────────┤           ║
║  │ pi-ai (统一 LLM API)                                        │           ║
║  │  ├─ 20+ providers, TypeBox schema                            │           ║
║  │  ├─ stream() / complete() / Context 序列化                   │           ║
║  │  ├─ 跨 provider 无缝切换 + thinking 统一                    │           ║
║  │  └─ OAuth 多 provider 认证                                   │           ║
║  └──────────────────────────────────────────────────────────────┘           ║
╚══════════════════════════════════════════════════════════════════════════════╝

╔══════════════════════════════════════════════════════════════════════════════╗
║  OpenDev — Compound AI × Rust 高性能                                       ║
║  ┌──────────────────────────────────────────────────────────────┐           ║
║  │ opendev-cli / opendev-tui / opendev-web                     │           ║
║  ├──────────────────────────────────────────────────────────────┤           ║
║  │ Workflow Slots (每个可独立绑定不同 provider/model):           │           ║
║  │  ┌─────────┐┌─────────┐┌─────────┐┌─────────┐┌─────────┐   │           ║
║  │  │ Normal  ││Thinking ││ Compact ││Critique ││  VLM    │   │           ║
║  │  │execution││reasoning││summarize││self-rev ││ vision  │   │           ║
║  │  └─────────┘└─────────┘└─────────┘└─────────┘└─────────┘   │           ║
║  ├──────────────────────────────────────────────────────────────┤           ║
║  │ Agent Fleet (并行子 agent)                                   │           ║
║  │  ├─ 每个 agent 独立上下文 + 独立模型绑定                     │           ║
║  │  ├─ Tokio async 并发，零 GIL 开销                            │           ║
║  │  └─ 结果聚合回主 session                                     │           ║
║  ├──────────────────────────────────────────────────────────────┤           ║
║  │ 20+ crates: agents, models, hooks, memory, tools-*, config  │           ║
║  └──────────────────────────────────────────────────────────────┘           ║
╚══════════════════════════════════════════════════════════════════════════════╝

╔══════════════════════════════════════════════════════════════════════════════╗
║  Vitamin — 注册表驱动 × 分层 SDK                                           ║
║  ┌──────────────────────────────────────────────────────────────┐           ║
║  │ @vitamin/cli → @vitamin/coding                               │           ║
║  │  VitaminApp · LeadSession · AgentSession · CodingSessionMgr │           ║
║  ├──────────────────────────────────────────────────────────────┤           ║
║  │ @vitamin/orchestrator                                        │           ║
║  │  Dispatcher · AgentRegistry · BackgroundManager              │           ║
║  │  PlanLoader · ReviewGate · Router · RetryStrategy            │           ║
║  ├──────────────────────────────────────────────────────────────┤           ║
║  │ @vitamin/hooks(31 timings) + @vitamin/tools + @vitamin/memory│           ║
║  ├──────────────────────────────────────────────────────────────┤           ║
║  │ @vitamin/agent (消息外置 workLoop)                           │           ║
║  ├──────────────────────────────────────────────────────────────┤           ║
║  │ @vitamin/ai + @vitamin/session + @vitamin/config + devtools  │           ║
║  ├──────────────────────────────────────────────────────────────┤           ║
║  │ @vitamin/shared + @vitamin/env + @vitamin/invariant          │           ║
║  └──────────────────────────────────────────────────────────────┘           ║
╚══════════════════════════════════════════════════════════════════════════════╝
```

---

### 1.3 Superpowers 深度分析

**本质**: 不是运行时框架，而是**提示词级方法论注入**。通过 `.md` Skill 文件自动触发宿主 agent 的行为。

**核心工作流**:
```
① brainstorming          → 苏格拉底式需求推敲，输出设计文档
② writing-plans          → 拆为 2-5 分钟粒度任务，附文件路径和验证步骤
③ subagent-driven-dev    → 每 task 分派独立子 agent
                            → 实现者 + 规范审查 + 代码质量审查（三角色）
④ test-driven-development → RED → GREEN → REFACTOR (先写测试再实现)
⑤ requesting-code-review → 两阶段评审 (规范合规 → 代码质量)
⑥ finishing-branch       → 测试 → merge/PR/discard 决策
```

**关键设计理念**:
- Skills 不是代码插件，而是精心设计的**工程约束提示词**
- "不写代码之前先做设计"是强制流程，不是建议
- 子 agent 上下文隔离: 每个 task 启动新 agent，controller 直接提供 task 文本
- 两阶段评审: 先验证功能是否符合 spec，再验证代码质量
- 12 个 Skills 覆盖从设计到发布的完整工程生命周期

**对 Vitamin 的启发价值**: 方法论前置、默认工程闭环、子 agent 上下文隔离原则

---

### 1.4 Deep Agents 深度分析

**本质**: 基于 LangGraph 的**图状态机 Agent SDK**。`create_deep_agent()` 编译出一个可 streaming、可 checkpoint 的有向图。

**核心模块**:
```
libs/deepagents/deepagents/
  ├── graph.py           → create_deep_agent() 主入口，编译 LangGraph 图
  ├── _models.py         → 模型配置
  ├── base_prompt.md     → 默认系统提示词
  ├── backends/          → 文件系统/沙箱后端 (Daytona, Modal, QuickJS)
  └── middleware/         → 中间件: memory, subagents, compaction
libs/cli/                → Textual TUI 终端
libs/acp/                → Agent Client Protocol
libs/evals/              → 评估套件
```

**默认工具面**:
| 工具 | 功能 |
|---|---|
| `write_todos` | 任务计划与进度追踪 |
| `read_file`, `write_file`, `edit_file` | 文件读写编辑 |
| `ls`, `glob`, `grep` | 文件系统搜索 |
| `execute` | Shell 命令 (支持沙箱) |
| `task` | 子 agent 委派 (隔离上下文) |

**图执行核心循环**:
```
agent.invoke(messages)
  → Graph Node: 解析消息
  → Graph Node: 调用 LLM
  → Graph Edge: 判断 tool_calls?
    → Yes: 执行工具 → 结果回注 → 回到 LLM
    → No:  检查完成条件 → 返回结果
  → Middleware: memory 自动摘要 / subagent 委派
  → Checkpointer: 持久化图状态
```

**对 Vitamin 的启发价值**: 子 agent 隔离窗口、自动上下文摘要、沙箱执行安全

---

### 1.5 Pi-mono 深度分析

**本质**: **有状态 Agent 核心 + 强扩展生态**的 TypeScript Agent toolkit。与 Vitamin 技术栈最接近。

**三层架构**:

| 层级 | 包 | 核心设计 |
|---|---|---|
| LLM 统一层 | `pi-ai` | 20+ providers, `stream()/complete()`, TypeBox schema, Context 序列化, 跨 provider 无缝切换 |
| Agent 核心 | `pi-agent-core` | **有状态** Agent 类(持有 messages), `agentLoop`, steering/followUp, beforeToolCall/afterToolCall, parallel/sequential 工具执行 |
| 产品壳 | `pi-coding-agent` | 默认工具 (read/write/edit/bash), session 树, extensions/skills/packages 扩展 |
| TUI | `pi-tui` | 差分渲染终端 UI |
| Web UI | `pi-web-ui` | Web components AI 聊天界面 |

**Agent 核心循环 (pi-agent-core)**:
```
agent.prompt("Hello")
  ├─ agent_start
  ├─ turn_start
  ├─ message_start { userMessage }
  ├─ message_end { userMessage }
  ├─ stream(model, context) → LLM 调用
  │  ├─ message_start { assistantMessage }
  │  ├─ message_update { text_delta / toolcall_delta }
  │  └─ message_end { assistantMessage }
  ├─ 有 tool_calls?
  │  ├─ Yes: beforeToolCall → execute → afterToolCall
  │  │       → message { toolResult }
  │  │       → turn_end → 回到 turn_start (下一轮)
  │  └─ No:  turn_end
  └─ agent_end { messages }
```

**与 Vitamin 的关键差异**:

| 维度 | Pi-mono | Vitamin |
|---|---|---|
| Agent 状态模型 | **有状态**: Agent 持有 messages | **消息历史外置**: Agent 不持有 messages，但保留执行状态 |
| 工具钩子 | `beforeToolCall`/`afterToolCall` (2 个) | 31 个 HookTiming 全生命周期 |
| 编排层 | 无内置 orchestrator | Dispatcher + AgentRegistry + BackgroundManager |
| Schema | TypeBox | Zod |
| Provider 数 | 20+ | 通过 ProviderRegistry 扩展 |
| 扩展机制 | extensions + packages + skills | hooks + tools presets + ToolCallbacks |
| 调试能力 | 无 | Atomics 断点暂停 + 调试协议 |

**对 Vitamin 的启发价值**: extension/package 标准化生态、极简默认工具面

---

### 1.6 OpenDev 深度分析

**本质**: Rust 原生的**高性能 Compound AI 系统**。核心创新是 Workflow Slot 多模型分工。

**Crate 结构** (20+ crates):
```
opendev-agents      → Agent 类型定义, react_loop, subagents, skills, doom_loop
opendev-models      → 多 provider 模型定义
opendev-hooks       → Hook 系统
opendev-memory      → 记忆管理
opendev-context     → 上下文管理
opendev-history     → 会话历史
opendev-config      → 配置
opendev-tools-core  → 工具核心抽象
opendev-tools-impl  → 工具实现
opendev-tools-lsp   → LSP 集成
opendev-tools-symbol → 符号分析
opendev-mcp         → MCP 协议
opendev-channels    → 通信通道
opendev-runtime     → 运行时
opendev-cli         → CLI 入口
opendev-tui         → TUI 终端
opendev-web         → Web UI
opendev-repl        → REPL
opendev-http        → HTTP 服务
opendev-docker      → Docker 集成
opendev-plugins     → 插件系统
```

**Workflow Slot 多模型分工**:
```json
{
  "model_provider": "anthropic",
  "model": "claude-sonnet-4-20250514",        // Normal (execution)
  "model_thinking_provider": "openai",
  "model_thinking": "o3",                      // Thinking (reasoning)
  "model_compact": "gpt-4.1-mini",            // Compact (summarization)
  "model_critique": "claude-sonnet-4",          // Critique (self-review)
  "model_vlm": "gpt-4o"                        // VLM (vision)
}
```

**对 Vitamin 的启发价值**: Workflow Slot 多模型分工、Agent Fleet 并行执行

---

## 二、Vitamin 14 模块全景解析

### 2.1 八层架构分层图

```
════════════════════════════════════════════════════════════════
 Layer 8 │ CLI 入口
─────────┼──────────────────────────────────────────────────────
         │ @vitamin/cli
         │ 命令行入口；run/print/json/interactive 已接线
         │ doctor/config/auth/rpc 仍有占位分支
         │ 默认用户路径走 vitamin.lead()
════════════════════════════════════════════════════════════════
 Layer 7 │ 应用容器
─────────┼──────────────────────────────────────────────────────
         │ @vitamin/coding
         │ VitaminApp · CodingSessionManager · AgentSession
         │ LeadSession · PromptManager · ResourceManager
         │ SettingsManager · 系统提示词两阶段运行时装配
════════════════════════════════════════════════════════════════
 Layer 6 │ 编排层
─────────┼──────────────────────────────────────────────────────
         │ @vitamin/orchestrator
         │ Dispatcher · AgentRegistry · BackgroundManager
         │ PlanLoader · ReviewGate · Router · RetryStrategy
         │ CircuitBreaker · performWork() · EventBus
════════════════════════════════════════════════════════════════
 Layer 5 │ 能力扩展层
─────────┼──────────────────────────────────────────────────────
         │ @vitamin/hooks         @vitamin/tools        @vitamin/memory
         │ 31 HookTimings        ToolRegistry          L1 持久知识
         │ HookEngine            3 presets             L2 压缩摘要
         │ Preset 系统           (minimal/standard/    L3 归档恢复
         │ (default/strict/       full)
         │  minimal/none)        ToolCallbacks
════════════════════════════════════════════════════════════════
 Layer 4 │ 执行引擎
─────────┼──────────────────────────────────────────────────────
         │ @vitamin/agent
         │ workLoop() · ToolExecutor · Agent 状态机
         │ steering/followUp 队列 · 15 种事件
         │ 核心: 消息外置 (不持有消息, 由调用方注入)
════════════════════════════════════════════════════════════════
 Layer 3 │ 基础设施层
─────────┼──────────────────────────────────────────────────────
         │ @vitamin/ai    @vitamin/session  @vitamin/config  @vitamin/devtools
         │ ModelRegistry  Session DAG树    JSONC schema    Atomics暂停
         │ ProviderReg    分支/合并        合并/迁移       断点管理
         │ stream()       持久化          Watcher         调试协议
         │ EventStream    上下文构建                       Worker控制
════════════════════════════════════════════════════════════════
 Layer 2 │ 公共工具层
─────────┼──────────────────────────────────────────────────────
         │ @vitamin/shared
         │ Logger · TypedEventEmitter · FSAdapter
         │ HttpClient · BaseError · JSON/JSONC helpers
════════════════════════════════════════════════════════════════
 Layer 1 │ 基座
─────────┼──────────────────────────────────────────────────────
         │ @vitamin/env           @vitamin/invariant
         │ 环境变量 · 默认常量    运行时断言 · 生产剥离
════════════════════════════════════════════════════════════════
```

### 2.2 各模块详细解析

#### Layer 1: 基座

**@vitamin/env** — 环境变量与默认常量
- 集中管理所有环境变量读取
- 提供 defaults 对象，统一默认值来源
- 零依赖

**@vitamin/invariant** — 运行时断言
- `invariant(condition, message)` 开发期断言
- 生产构建时自动剥离（tree-shaking friendly）
- 零依赖

#### Layer 2: 公共工具

**@vitamin/shared** — 日志、事件、文件系统、HTTP、错误体系
- `Logger`: 分级日志，支持结构化输出
- `TypedEventEmitter`: 类型安全的事件发射器
- `FSAdapter`: 文件系统抽象层
- `HttpClient`: HTTP 请求封装
- `BaseError`: 错误层次体系
- JSON/JSONC 解析工具

#### Layer 3: 基础设施

**@vitamin/ai** — 多 Provider 统一 LLM API
- `ModelRegistry.resolve(modelId)`: 模型 ID → Model 对象（含 api, baseUrl, contextWindow）
- `ProviderRegistry.get(providerId)`: 懒加载 Provider 实例，解析凭据
- `stream(model, provider, context, signal)`: 统一流式推理接口
- `EventStream`: 收集文本/thinking/工具调用/usage 等缓冲事件
- 费用计算: input/output/cache token 成本

**@vitamin/session** — 会话存储与消息树
- `Session<T>`: 泛型消息存储，底层 DAG 树结构
- `SessionStore`: 多后端（file/remote/memory）
- `buildContext()`: 构建 LLM 上下文（messages + summary）
- `Session.branch(entryId)`: 切换到指定条目所在分支
- `SessionManager.branchAt(entryId)`: 对活跃会话的便捷分支入口
- 分支不可变: 原路径保留，新分支独立演进
- 分页查询: 支持大会话的增量加载

**@vitamin/config** — JSONC 配置管理
- `ConfigStore`: JSONC 文件的 schema 验证、多层合并
- `ConfigWatcher`: 文件变更监听，自动重载
- `VitaminConfigSchema`: 完整配置 schema 定义
- 版本迁移: 配置格式升级的自动迁移

**@vitamin/devtools** — 断点调试与开发工具
- `Atomics.wait()` 同步暂停: 真正阻塞 Agent 执行
- `Breakpoints`: 断点注册、启停与 shouldPause 判定
- `protocol.ts`: step/over/continue/stop 等调试命令协议类型
- `DevtoolsService` + `ServiceWorkerServer`: Worker 控制平面与调试服务
- 命令协议通道: step/over/stop 已进入协议层

#### Layer 4: 执行引擎

**@vitamin/agent** — 消息外置的 Agent 执行引擎

**核心设计: 消息外置**
```
Agent 不持有消息历史 → 由调用方通过 AgentRunContext 注入
Agent 持有运行态 → AgentState + AbortController + steering/followUp 队列
需要 reset() 清零 AgentState
```

**状态机** (严格状态转换):
```
idle → streaming → tool_executing → streaming → completed
                                                   ↑
error / aborted ←── 任意状态
```

**workLoop 核心**:
```typescript
while (true) {
  // 1. transformContext() — 可选上下文压缩/注入
  contextMessages = transformContext ? await transformContext(messages, signal) : messages

  // 2. stream(model, provider, context) — LLM 推理
  for await (event of stream) { emit('stream_event', event) }

  // 3. 提取 AssistantMessage → push 到 messages
  assistantMessage = await stream.result()
  messages.push(assistantMessage)

  // 4. 有 tool_calls?
  if (hasToolCalls(assistantMessage)) {
    for (const toolCall of toolCalls) {
      // 检查 steering (中断注入)
      if (steeringMessages.length > 0) { messages.push(...steering); break }
      // Hook → Zod 验证 → 执行 → 结果回注
      result = await toolExecutor.execute(toolCall, signal)
      messages.push(toolResult)
    }
    continue  // 回到循环顶部
  } else {
    // 检查 followUp → 无则退出
    break
  }
}
```

**15 种事件**: status_change, turn_start, turn_end, tool_call_start, tool_call_end, stream_event 等

#### Layer 5: 能力扩展层

**@vitamin/hooks** — 31 个 HookTiming 的全生命周期拦截

| 分类 | Timing |
|---|---|
| 消息生命周期 (4) | `chat.message.before`, `chat.message.after`, `session.created`, `session.deleted` |
| 消息转换 (2) | `messages.transform`, `chat.params` |
| 工具执行 (2) | `tool.execute.before`, `tool.execute.after` |
| 流处理 (2) | `stream.start`, `stream.end` |
| 上下文管理 (2) | `compaction.before`, `compaction.after` |
| 系统提示词 (1) | `system-prompt.transform` |
| 后台任务 (2) | `background.start`, `background.end` |
| 编排任务 (6) | `task.created/started/completed/failed/cancelled/recovered` |
| 计划执行 (3) | `plan.started`, `plan.step_completed`, `plan.completed` |
| 评审 (3) | `review.requested`, `review.passed`, `review.failed` |
| 其他 (4) | 生成监控等扩展 timing |

HookEngine 执行模式:
- 按优先级排序 → 依次执行 → 每个 handler 可修改 output → 可取消/中断
- Preset 系统: default / strict / minimal / none

**@vitamin/tools** — 工具注册与预设

| Preset | 包含工具 |
|---|---|
| **minimal** | read, write, edit, bash |
| **standard** | + ls, find, grep, LSP (definition/references/symbols/diagnostics), task-delegate |
| **full** | + agent-call, perform-work, task-create/get/list/update, cancel-background, clarify-request, skill-load/execute |

`ToolCallbacks` 注入模式:
```typescript
ToolCallbacks = {
  dispatchTask()  → 分派子任务到 orchestrator
  callAgent()     → 直接调用指定 agent
  performWork()   → 执行计划文件
  createTask()    → 创建编排任务
  loadSkill()     → 加载 skill 提示词
}
```

**@vitamin/memory** — 三层记忆方案

| 层级 | 名称 | 功能 |
|---|---|---|
| L1 | Persistent Memory | AGENTS.md / 项目知识 → 每轮注入系统提示词 |
| L2 | Compaction | 调用模型摘要旧消息 → 释放 token 空间 |
| L3 | Archive | 被压缩消息归档 → 支持后续恢复查询 |

当前边界:
- memory 包提供默认阈值与能力模型，但默认 lead 主链不会自动创建 MemoryManager
- memory 包默认阈值是 prune 70%、compaction 85%
- 当前实现里，压缩要么通过显式 `session.compact()` 触发，要么由调用方在 `messages.transform` 中接入

#### Layer 6: 编排层

**@vitamin/orchestrator** — 多 Agent 调度与任务管理

**Dispatcher 核心能力**:
- `dispatch(task)` → 同步/后台执行
- `executeSyncTask()` → 创建 child session → agent.run() → 返回结果
- `BackgroundManager.submit()` → 异步队列 → 返回 taskId

**Plan 执行路径**:
```
performWork(plan.md)
  → PlanLoader.load(plan) → 解析 markdown → 提取步骤列表
  → 恢复 checkpoint（如有）
  → Step Loop:
    → getNextStep() → 跳过已完成
    → buildStepPrompt() → 组装步骤上下文
    → dispatcher.dispatch(stepPrompt) → 子 Agent 执行
    → 可选 ReviewGate → pass/fail
    → checkpointStore.save() + planRunStore.save()
    → planLoader.save() → 回写 markdown 进度
```

**AgentRegistry**: `resolve(name | category)` → AgentSpec，支持 Router 策略路由

**质量门禁**:
- ReviewGate → 评审结果
- RetryStrategy → 失败重试
- CircuitBreaker → 熔断保护

#### Layer 7: 应用容器

**@vitamin/coding** — 产品中心与入口装配

**VitaminApp.start() 装配流程**:
```
VitaminApp.start()
  ├─ SettingsManager.load()        → 加载 vitamin.yaml
  ├─ ResourceManager.load()        → 加载 AGENTS.md, SKILLS.md, prompts
  ├─ build initial lead prompt     → 初始系统提示词
  ├─ bootstrapToolsAndOrchestrator()
  │   ├─ ToolRegistry 注册内置工具 + 用户注入工具
  │   └─ 初始化 Orchestrator (Dispatcher + AgentRegistry + BackgroundManager)
  └─ build final lead prompt       → 完成系统提示词装配
```

**LeadSession**:
- 懒创建: 首次 `vitamin.lead()` 时实例化
- 单实例复用: 生命周期内不重建
- 订阅 orchestrator eventBus: task.created/completed/failed
- 最终通过独立的 `parseLeadResult()` 助手解析状态: done / done_with_concerns / needs_context / blocked

#### Layer 8: CLI 入口

**@vitamin/cli** — 命令行入口
```
vitamin [prompt]           → runPrintMode → vitamin.lead(prompt)
vitamin --json [prompt]    → runJsonMode → vitamin.lead(prompt)
vitamin --interactive      → runInteractiveMode → REPL 循环
vitamin --rpc              → 预留分支；当前仅 createSession，未实现 JSON-RPC
```

补充说明:
- `doctor` / `auth` / `config` 子命令已完成参数解析，但当前仍为 TODO 占位

---

## 三、核心运行时流程详解

### 3.1 主流程: 用户输入 → AI 响应 (Lead 路径)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│  ① 用户输入                                                             │
│  ─────────────                                                          │
│  vitamin.lead(userPrompt)                                               │
│    → 首次调用: 懒创建 LeadSession                                       │
│    → 后续调用: 复用同一 LeadSession                                     │
│                                                                         │
│  ② 消息预处理                                                           │
│  ──────────────                                                         │
│  LeadSession.run(userPrompt)                                            │
│    → AgentSession.prompt(userPrompt)                                    │
│      ┌─ Hook: chat.message.before ─── cancelled? → 中止                │
│      ├─ Session.append(userMessage) → 消息写入 DAG 树                   │
│      ├─ Session.buildContext() → {messages, summary?}                   │
│      │  └─ 默认仅返回 summary + messages                                │
│      │     若调用方额外接入 memory/messages.transform，才会做 prune/compact│
│      ├─ Hook: chat.params → 自定义 temperature/maxTokens/thinkingLevel │
│      └─ Hook: messages.transform → 修改最终消息数组                     │
│                                                                         │
│  ③ Agent 执行循环                                                       │
│  ────────────────                                                       │
│  Agent.run({model, systemPrompt, tools, messages})                      │
│    → workLoop():                                                        │
│      ┌─ transformContext() → 可选上下文压缩/注入                        │
│      ├─ stream(model, provider, context, signal)                        │
│      │  → Provider async 流式推理                                       │
│      │  → EventStream 收集: text_delta, thinking_delta, toolcall_delta  │
│      ├─ 提取 AssistantMessage → push 到 messages                       │
│      │                                                                   │
│      ├─ 有 tool_calls?                                                  │
│      │  ├─ Yes → ④ 工具执行循环                                         │
│      │  └─ No  → 检查 followUp → 无则退出循环                          │
│      │                                                                   │
│  ④ 工具执行循环                                                         │
│  ──────────────                                                         │
│      │  for each toolCall:                                              │
│      │    ├─ 检查 steering 队列 → 有注入? → 中断工具循环                │
│      │    ├─ Hook: tool.execute.before → 可取消/修改参数                │
│      │    ├─ Zod schema 验证参数                                        │
│      │    ├─ tool.execute(params, signal)                               │
│      │    │  └─ 如果是编排工具 → ⑤ 子 Agent 委派                       │
│      │    ├─ Hook: tool.execute.after → 可转换结果                      │
│      │    └─ messages.push(toolResult)                                  │
│      │  回到 workLoop 顶部 (下一轮 LLM 调用)                           │
│      │                                                                   │
│  ⑤ 编排委派 (如需)                                                      │
│  ────────────────                                                       │
│      dispatchTask({prompt, subagent, mode})                             │
│        → Dispatcher.dispatch()                                          │
│          ├─ AgentRegistry.resolve(name/category)                        │
│          ├─ 创建 child session (ephemeral/sticky)                       │
│          ├─ mode='sync': await session.prompt() → 返回结果              │
│          └─ mode='background': BackgroundManager.submit() → 返回 taskId │
│        → 可选: ReviewGate / RetryStrategy / CircuitBreaker              │
│        → EventBus: task.completed / task.failed                         │
│        → LeadSession 收集 TaskSummary                                   │
│                                                                         │
│  ⑥ 返回结果                                                             │
│  ──────────                                                             │
│  workLoop 退出 → 返回最终 AssistantMessage                              │
│    → Hook: chat.message.after                                           │
│    → 当前 Session 内消息已更新                                           │
│    → 如需落盘，由外层 SessionManager.save()/saveAll() 负责              │
│    → parseLeadResult()                                                  │
│      → 提取状态: done / done_with_concerns / needs_context / blocked    │
│    → 输出给用户                                                         │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 3.2 计划执行流程

```
┌──────────────────────────────────────────────────────────────────┐
│  Lead Agent 识别到复杂任务 → 调用 performWork(plan.md)           │
│                                                                  │
│  ┌─ PlanLoader.load(plan)                                        │
│  │  → 解析 markdown → 提取步骤列表 [{id, title, status, body}]  │
│  │  → 恢复 checkpoint (如有上次中断)                             │
│  │                                                               │
│  │  ┌──── Step Loop ─────────────────────────────────┐          │
│  │  │                                                 │          │
│  │  │  getNextStep()                                  │          │
│  │  │  → 跳过 completed 步骤                          │          │
│  │  │  → 返回下一个 pending 步骤                      │          │
│  │  │                                                 │          │
│  │  │  buildStepPrompt(step)                          │          │
│  │  │  → 组装: 步骤描述 + 上下文 + 验证标准          │          │
│  │  │                                                 │          │
│  │  │  dispatcher.dispatch(stepPrompt)                │          │
│  │  │  → child session → Agent.run() → 执行步骤      │          │
│  │  │                                                 │          │
│  │  │  ReviewGate (可选)                              │          │
│  │  │  → pass: 标记 step ✓                           │          │
│  │  │  → fail: 标记 step ✗                           │          │
│  │  │                                                 │          │
│  │  │  checkpointStore.save()                         │          │
│  │  │  planLoader.save() → 回写 markdown 进度         │          │
│  │  │                                                 │          │
│  │  │  还有下一步? → 是: 循环 → 否: 退出              │          │
│  │  └─────────────────────────────────────────────────┘          │
│  │                                                               │
│  └─ 所有步骤完成 → EventBus: plan.completed → 返回结果          │
└──────────────────────────────────────────────────────────────────┘
```

### 3.3 上下文压缩流程

```
当前默认主链:
  AgentSession.prompt()
    → Session.buildContext()
    → 交给 messages.transform hooks 做可选上下文改写

memory 包可提供的能力模型:
  ┌─────────────────────────────────────┐
  │ Prune: 触发阈值默认 70%            │
  │ Compact: 触发阈值默认 85%          │
  │ Archive: 保存被压缩历史            │
  └─────────────────────────────────────┘

接入方式:
  1. 显式调用 session.compact(summary, compactedCount)
  2. 在 messages.transform 中挂接 MemoryManager / prune / compact 逻辑

结论:
  这部分是已实现的能力层，不是当前默认 lead 路径中的自动行为。
```

### 3.4 会话分支流程

```
Session 消息 DAG 树:

  root
   ├─ user: "实现功能 A"
   ├─ assistant: "方案 1..."
   ├─ user: "继续"
   ├─ assistant: "实现代码..."  ← 分支点
   │   ├─ [branch-1] (原路径)
   │   │  ├─ user: "有 bug"
   │   │  └─ assistant: "修复..."
   │   └─ [branch-2] (新分支)
   │      ├─ user: "换个方案"
   │      └─ assistant: "方案 2..."

Session.branch(entryId)
  → 将当前 leaf 切换到指定条目所在分支
  → 原路径不可变
  → 新分支独立演进
  → 后续 prompt() 在新分支上执行

如果从管理器视角操作，则使用 SessionManager.branchAt(entryId)
```

### 3.5 Hook 拦截流程

```
运行时事件触发
     │
     ▼
HookEngine.execute(timing, input, output)
  │
  ├─ 1. 查找 timing 下所有注册 handlers
  ├─ 2. 按优先级排序
  ├─ 3. 依次执行:
  │     handler₁(input, output) → 可修改 output
  │     handler₂(input, output) → 可修改 output
  │     handler₃(input, output) → 可取消/中断
  ├─ 4. 返回最终 output
  │
  └─ 示例: chat.message.before
       input:  { message, sessionId, isFirstMessage }
       output: { message, cancelled }
       → handler 可修改 message 内容
       → handler 可设 cancelled=true 阻止发送
```

---

## 四、框架 × Vitamin 模块级对照矩阵

### 4.1 模块对照

| Vitamin 模块 | Superpowers | Deep Agents | Pi-mono | OpenDev |
|---|---|---|---|---|
| **@vitamin/env** | — | — | — | opendev-config (部分) |
| **@vitamin/invariant** | — | — | — | — |
| **@vitamin/shared** | — | langchain-core utils | — | opendev-http 等 |
| **@vitamin/ai** | 宿主提供 | `init_chat_model` | **pi-ai** (最接近) | opendev-models |
| **@vitamin/session** | 宿主管理 | Checkpointer | session JSONL 树 | opendev-history |
| **@vitamin/config** | — | — | — | opendev-config |
| **@vitamin/devtools** | — | — | — | — (**独有**) |
| **@vitamin/agent** | 宿主 agent | LangGraph graph | **pi-agent-core** (最接近) | opendev-agents |
| **@vitamin/hooks** | — | Middleware | beforeToolCall x2 | opendev-hooks |
| **@vitamin/tools** | 宿主工具 | read/write/execute/task | 默认工具+extensions | opendev-tools-* |
| **@vitamin/memory** | — | auto-summarize | compaction | opendev-memory |
| **@vitamin/orchestrator** | skills 工作流 | task() 子 agent | 无内置 | opendev-agents fleet |
| **@vitamin/coding** | — | CLI app | pi-coding-agent | opendev-cli |
| **@vitamin/cli** | — | CLI (Textual TUI) | coding-agent CLI | opendev-repl/tui |

### 4.2 能力维度对照

| 能力维度 | Superpowers | Deep Agents | Pi-mono | OpenDev | Vitamin |
|---|---|---|---|---|---|
| **Agent 状态** | 宿主决定 | 图管理 | **有状态**(持有msg) | 有状态 | **消息历史外置，执行状态内置** |
| **多模型支持** | 宿主决定 | init_chat_model | 20+ providers | workflow slot 多模型 | ModelRegistry + ProviderRegistry |
| **流式推理** | 宿主提供 | LangGraph streaming | stream()/complete() | 内置 | EventStream 统一协议 |
| **工具验证** | 无 | Pydantic | TypeBox + AJV | 内置 | Zod schema |
| **上下文压缩** | 新 agent 隔离 | auto-summarize | session compaction | Compact workflow | Memory 三层 + 可选 Hook 接入 |
| **子 Agent 隔离** | 每 task 新 agent | task() 隔离窗口 | 无内置 | Fleet 独立上下文 | Child Session (ephemeral/sticky) |
| **计划执行** | writing-plans | write_todos | 无内置 | — | PlanLoader + performWork |
| **质量评审** | 两阶段 review | — | — | Critique workflow | ReviewGate (可选) |
| **失败重试** | — | — | — | — | RetryStrategy + CircuitBreaker |
| **断点调试** | — | — | — | — | **Atomics 暂停 + 协议** |
| **钩子系统** | — | Middleware (粗粒度) | beforeToolCall x2 | hooks | **31 timing HookEngine** |
| **扩展标准** | .md Skill 文件 | tools + middleware | **extensions + packages** | MCP + plugins | tools + hooks + MCP |
| **跨 provider 切换** | 宿主决定 | init_chat_model | **无缝切换 + thinking 转换** | workflow slot | ProviderRegistry |
| **沙箱执行** | 无 | **Daytona/Modal/QuickJS** | 无 | — | 无 |
| **并行工具执行** | 宿主决定 | — | **parallel/sequential** | async Tokio | 顺序执行 |
| **Steering/FollowUp** | — | — | **steering + followUp** | — | steering + followUp |

---

## 五、Vitamin 独有优势与差距分析

### 5.1 Vitamin 领先或独有的能力

| 能力 | 描述 | 四大框架状况 |
|---|---|---|
| **Atomics 断点调试** | 同步暂停 + Worker 控制平面 + 调试协议 | 四个框架均无 |
| **31 timing Hook** | 全生命周期细粒度拦截，覆盖消息/工具/流/编排/计划/评审 | Deep Agents 有 middleware 但粗粒度; Pi-mono 仅 2 个工具钩子 |
| **消息历史外置 Agent** | Agent 不持有消息历史，天然支持多会话/子会话/状态重放；但仍保留执行状态与控制队列 | Pi-mono 接近但 Agent 持有 messages |
| **ToolCallbacks 注入** | 编排能力通过回调注入工具，不硬编码依赖 | Deep Agents 工具自包含; Superpowers 依赖宿主 |
| **三层 Memory** | L1 持久知识 + L2 压缩 + L3 归档，分层清晰；当前默认主链仍需显式接线 | Deep Agents 有 auto-summarize; Pi-mono 有 compaction |
| **14 包精细分层** | 每层职责明确，可独立使用或组合 | OpenDev 20+ crates 最多; 其余较粗 |
| **ReviewGate + RetryStrategy + CircuitBreaker** | 完整质量门禁套件 | 其余框架均无等价物 |
| **Plan 执行 + Checkpoint** | Markdown plan 解析 → 步骤执行 → 进度回写 | Superpowers 概念类似但依赖宿主 |

### 5.2 Vitamin 与最佳实践的差距

| 维度 | 最佳实践来源 | Vitamin 当前状态 | 差距 |
|---|---|---|---|
| **默认工程闭环** | Superpowers | 缺少 brainstorm → plan → review 的默认产品路径 | Lead prompt 是自由对话，非结构化工程流程 |
| **多模型 Workflow Slot** | OpenDev | 所有阶段用同一 model 参数 | 无 execution/planning/critique/compact 角色分工 |
| **标准化扩展生态** | Pi-mono | 有 hooks/tools 但无标准 manifest | 无扩展包发现/加载/分发机制 |
| **并行工具执行** | Pi-mono | 工具顺序执行 | Pi-mono 支持 parallel/sequential 切换 |
| **沙箱执行安全** | Deep Agents | 无内置沙箱 | Deep Agents 有 Daytona/Modal/QuickJS |
| **子 Agent 隔离规范** | Deep Agents + Superpowers | 有 child session 但无默认策略 | 缺少 ephemeral/sticky 自动选择规则 |
| **Review 状态机** | Superpowers | ReviewGate 可选、无 waiting_review 流转 | 缺少评审等待/恢复/升级状态流转 |
| **跨 Provider thinking 转换** | Pi-mono | 各 provider 独立处理 | Pi-mono 自动将 thinking blocks 转为 `<thinking>` 标签 |

---

## 六、简化流程总览

### 6.1 七步简化流程

```
┌────────────────────────────────────────────────────────────────────────┐
│                     Vitamin 运行时七步简化流程                          │
├────────┬──────────────┬─────────────────────────────────────┬──────────┤
│ 步骤   │ 阶段         │ 核心动作                            │ 涉及模块 │
├────────┼──────────────┼─────────────────────────────────────┼──────────┤
│  ①     │ 启动         │ 配置加载 → 资源加载 → 工具注册       │ cli      │
│        │              │ → 编排初始化 → 系统提示词装配         │ coding   │
│        │              │                                      │ config   │
│        │              │                                      │ tools    │
│        │              │                                      │ orchestr │
├────────┼──────────────┼─────────────────────────────────────┼──────────┤
│  ②     │ 接收         │ 用户输入 → Hook 拦截 → 消息入 DAG   │ coding   │
│        │              │ → 构建上下文                         │ hooks    │
│        │              │                                      │ session  │
├────────┼──────────────┼─────────────────────────────────────┼──────────┤
│  ③     │ 推理         │ context → stream() → Provider 调用  │ agent    │
│        │              │ → EventStream 流式事件               │ ai       │
├────────┼──────────────┼─────────────────────────────────────┼──────────┤
│  ④     │ 工具执行     │ tool_calls 解析 → Hook 拦截          │ agent    │
│        │              │ → Zod 验证 → 执行 → 结果回注         │ tools    │
│        │              │ → 回到 ③ (循环)                      │ hooks    │
├────────┼──────────────┼─────────────────────────────────────┼──────────┤
│  ⑤     │ 编排委派     │ dispatchTask() → Dispatcher 路由    │ orchestr │
│   (按需)│              │ → child session → 子 Agent 执行     │ session  │
│        │              │ → ReviewGate → 结果收集              │ agent    │
├────────┼──────────────┼─────────────────────────────────────┼──────────┤
│  ⑥     │ 上下文变换   │ 默认走 messages.transform；若接入   │ hooks    │
│   (可选)│              │ memory/prune/compact 才执行压缩      │ memory   │
│        │              │ 或显式 session.compact()             │ session  │
├────────┼──────────────┼─────────────────────────────────────┼──────────┤
│  ⑦     │ 输出         │ 最终消息 → 解析状态 → 返回用户      │ coding   │
│        │              │ → 如需持久化，由 SessionManager 保存 │ session  │
│        │              │                                      │ hooks    │
└────────┴──────────────┴─────────────────────────────────────┴──────────┘
```

### 6.2 全局数据流简化图

```
用户输入
  │
  ▼
[Hook: chat.message.before] ── cancelled? → 中止
  │
  ▼
Session.append() → 消息 DAG 树
  │
  ▼
buildContext()
  │
  ▼
messages.transform hooks
  │
  ├─ 未接入 memory → 原样进入 Agent.workLoop()
  └─ 已接入 memory → 可执行 prune/compact/archive
             │
             ▼
        归档到 L3
  │
  ▼
Agent.workLoop()
  │
  │  ┌──────────────────────────────────────────────────┐
  │  │                LLM 推理循环                      │
  │  │                                                  │
  │  │  transformContext()                               │
  │  │       │                                          │
  │  │       ▼                                          │
  │  │  stream(model, provider, context)                │
  │  │       │                                          │
  │  │       ▼                                          │
  │  │  EventStream → AssistantMessage                  │
  │  │       │                                          │
  │  │       ▼                                          │
  │  │  有 tool_calls?                                  │
  │  │  │ Yes                    │ No                   │
  │  │  ▼                        ▼                      │
  │  │  [tool.execute.before]    检查 followUp          │
  │  │  │                        │                      │
  │  │  Zod 验证                 无 → 退出循环          │
  │  │  │                                               │
  │  │  tool.execute()                                  │
  │  │  │                                               │
  │  │  ├─ 普通工具 → 返回结果                          │
  │  │  └─ 编排工具 → dispatchTask()                    │
  │  │       │                                          │
  │  │       ▼                                          │
  │  │  Dispatcher → child session → 子 Agent           │
  │  │       │                                          │
  │  │  [tool.execute.after]                            │
  │  │  │                                               │
  │  │  messages.push(toolResult)                       │
  │  │  │                                               │
  │  │  检查 steering ── 有注入? → 中断工具循环         │
  │  │  │                                               │
  │  │  回到 stream() ──────────────────────────────────┘
  │  │
  │  └──────────────────────────────────────────────────┘
  │
  ▼
返回 AssistantMessage
  │
  ▼
[Hook: chat.message.after]
  │
  ▼
当前 Session 内状态已更新
  │
  ▼
如需持久化: SessionManager.save()/saveAll()
  │
  ▼
parseLeadResult() → { status, tasks }
  │
  ▼
输出给用户
```

### 6.3 五大框架 Agent 循环对比简化

```
╔══════════════════════════════════════════════════════════════════════╗
║              五大框架 Agent 核心循环对比                              ║
╠══════════════════════════════════════════════════════════════════════╣
║                                                                      ║
║  Superpowers:                                                        ║
║  skill 触发 → 宿主 agent loop → 子 agent dispatch → review → finish ║
║  (本身无 agent loop，完全依赖宿主)                                   ║
║                                                                      ║
║  Deep Agents:                                                        ║
║  LangGraph Node → LLM → tool_calls? → execute → Node (checkpoint)  ║
║  + middleware 管道 (memory/subagent/compaction)                      ║
║                                                                      ║
║  Pi-mono:                                                            ║
║  agent.prompt() → stream() → tool_calls? → beforeToolCall           ║
║  → execute (parallel/sequential) → afterToolCall → continue          ║
║  + steering/followUp 队列                                            ║
║                                                                      ║
║  OpenDev:                                                            ║
║  react_loop → workflow slot(Normal/Thinking/Compact/Critique/VLM)   ║
║  → tool execution → MCP → Agent Fleet 并行                          ║
║                                                                      ║
║  Vitamin:                                                            ║
║  workLoop() → transformContext() → stream() → tool_calls?           ║
║  → [Hook:before] → Zod validate → execute → [Hook:after]           ║
║  → check steering → continue                                        ║
║  + 31 Hook timings + Dispatcher delegation + Plan execution         ║
║                                                                      ║
╚══════════════════════════════════════════════════════════════════════╝
```

---

## 七、依赖关系总图

```
@vitamin/cli
    └──→ @vitamin/coding
              ├──→ @vitamin/orchestrator
              │         ├──→ @vitamin/agent ──→ @vitamin/ai ──→ @vitamin/shared ──→ @vitamin/env
              │         ├──→ @vitamin/session ──→ @vitamin/shared
              │         └──→ @vitamin/tools ──→ @vitamin/shared
              ├──→ @vitamin/hooks ──→ @vitamin/shared
              ├──→ @vitamin/memory ──→ @vitamin/ai
              ├──→ @vitamin/config ──→ @vitamin/shared
              ├──→ @vitamin/devtools ──→ @vitamin/shared
              └──→ @vitamin/session

@vitamin/invariant (独立，构建期使用)
```

---

## 八、建议落地矩阵

### 8.1 从四大框架提炼的改进方向

| 优先级 | 来源 | 借鉴点 | 落地包 | 原因 |
|---|---|---|---|---|
| **P0** | Superpowers | 默认工程闭环: brainstorm → plan → execute → review | coding, orchestrator, tools | Vitamin 缺的不是底层能力而是默认方法论 |
| **P0** | OpenDev | Workflow Slot 多模型分工 | ai, config, orchestrator | 与 Vitamin 分层高度契合，成本低收益高 |
| **P1** | Pi-mono | 标准化扩展/package 生态 | coding, tools, hooks | Vitamin 有扩展基础但缺标准 manifest |
| **P1** | Deep Agents | 子 agent 隔离强化 + 沙箱 | orchestrator, tools | 安全边界和隔离策略需要显式化 |
| **P1** | Pi-mono | 并行工具执行 | agent | 提升多工具场景效率 |
| **P2** | Superpowers | 双阶段评审 (spec → quality) | orchestrator ReviewGate | 已有接线点，需默认路径化 |
| **P2** | Pi-mono | 跨 provider thinking 转换 | ai | 提升多模型协作体验 |
| **P3** | OpenDev | Agent Fleet 并行子 agent | orchestrator, background | 已有后台基础，扩展成本低 |

### 8.2 三阶段收口路径

```
Phase 1: 默认工作流产品化 (最高优先)
────────────────────────────────────
目标: vitamin.lead() 默认走完整工程流程
  当前: vitamin.lead() → 自由对话
  目标: vitamin.lead() → 澄清 → 设计 → 计划 → 执行 → 评审 → 收尾
改动: coding (lead prompt), orchestrator (plan/review 默认策略),
      tools (默认工具束), session (child session 规则)
    │
    │ 稳定的阶段边界
    ▼
Phase 2: Workflow Slot 多模型分工
────────────────────────────────
目标: 不同阶段可绑定不同模型
  当前: 所有阶段用同一个 model
  目标: execution / planning / critique / compact / vision 独立 slot
改动: config (slot schema), ai (slot → model 解析),
      orchestrator (阶段取模用 slot)
    │
    │ 稳定的工作流接口
    ▼
Phase 3: 标准化扩展生态
──────────────────────
目标: 外部包可稳定接入工具/prompt/hooks
  当前: 扩展通过代码注入，无标准格式
  目标: manifest 声明 + 发现加载 + preset 切换
改动: coding (扩展发现), tools (manifest), hooks (挂接约定), cli (preset)
```

---

## 九、总结

### Vitamin 的核心定位

Vitamin 是一个 **注册表驱动的分层 AI Agent SDK**，14 个包覆盖从环境变量到产品入口的完整层次。

### 核心竞争力

1. **消息历史外置 Agent 设计** — 天然支持多会话、子会话、状态重放，同时保留 Agent 自身执行状态与控制队列
2. **31 Timing Hook 系统** — 全生命周期细粒度拦截，业内粒度最细
3. **Atomics 断点调试** — 业内独有的 Agent 调试能力
4. **14 包精细分层** — 每层可独立使用，组合灵活
5. **完整编排工具箱** — Dispatcher + ReviewGate + Retry + CircuitBreaker + PlanLoader

### 与四大框架的定位差异

```
Superpowers → 方法论插件 (不是运行时框架，是流程注入)
Deep Agents → SDK + 产品   (LangGraph 图状态机 + CLI)
Pi-mono     → 产品 + 生态   (有状态薄核心 + 强扩展)
OpenDev     → 性能产品      (Rust + 多模型 compound)
Vitamin     → 分层 SDK      (TypeScript + 注册表 + Hook + 编排)
```

### 最关键的结论

> **Vitamin 的短板不在基础层** — AI/Session/Agent/Config/Tools/Hooks 均已成熟。
> **真正的差距在于 orchestrator 的高阶编排能力接入产品默认路径的最后一公里。**
> 先收口默认工程工作流，引入 Workflow Slot 多模型分工，标准化扩展生态 — 其余自然跟上。
