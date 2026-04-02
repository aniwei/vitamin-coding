# @vitamin/prompt

Vitamin 主/子 Agent 系统提示词管理与运行时装配引擎。

---

## 目录

1. [架构概览](#架构概览)
2. [当前实现边界](#当前实现边界)
3. [Main Agent (Lead) Prompt v1](#main-agent-lead-prompt-v1)
4. [Sub Agent (Worker) Prompt v1](#sub-agent-worker-prompt-v1)
5. [运行时装配流程](#运行时装配流程)
6. [与外部框架的关键差异](#与外部框架的关键差异)

---

## 架构概览

Vitamin 采用 **运行时动态装配 + 每轮重注入** 模型（非静态 startup-time 拼接），核心流程：

```
VitaminApp.start()
  → promptManager.assemblePreset(main)        // 按 preset 组装 lead guidance
  → system-prompt.transform hook chain        // 每轮 LLM 调用前二次注入
  → AgentSession.promptRefresh()              // 刷新上下文快照

task_delegate / agent_call
  → TaskExecutor.dispatch / callAgent
  → runSession({ prompt, agentName, slot })   // 隔离子 session
  → TaskStore(内存)记录 task 输入/输出
```

**关键设计原则**：
- Lead system prompt 每轮可通过 `system-prompt.transform` 做运行时增强
- task_delegate 的 slot 一路透传到 session 选模链路
- `write_todos` 是纯 UI/记忆工具，在 Orchestrator 中按 session 维护内存 todo 列表，不驱动执行
- Slot 路由一路透传：tool → orchestrator → session → model selection

---

## 当前实现边界

以下内容是**当前代码已经实现**的能力：

- 编排工具是 `task_delegate`、`task_create`、`task_get`、`task_list`、`task_update`、`write_todos`、`agent_call`、`review_call` 等。
- `write_todos` 是纯 UI/记忆工具，由 Orchestrator 按 session 维护内存 todo 列表（`Map<string, TodoItem[]>`），不返回 planId，不驱动执行链路。
- `task_delegate` 直接调用 `TaskExecutor.dispatch`，支持 `prompt + subagent/category + slot + mode` 参数，返回子会话文本输出（`output.text`）。
- `createSession(agentName)` 当前会同时结合 settings 中 `agents.<name>` 覆盖和 `agent-profiles.json` 模板；subagent prompt 通过 `assemblePreset({ preset: 'subagent', profile, context })` 做模板插值。
- 子代理上下文 `SubAgentPromptContext` 仅包含 `taskTitle`、`taskDescription`、`taskFiles` 三个字段。

---

## Main Agent (Lead) Prompt v1

Lead Agent 的系统提示词由 `PromptManager.assemble()` 从 `prompts/lead-guidance.md` 加载，
按以下 10 个段落顺序组合（均为英文）。

### Section 1: Identity & Environment

定义 Vitamin 身份与运行环境感知。包含：Agent 能力声明、Agent 循环工作方式、
工作目录约定、上下文有限性处理。

### Section 2: Security & Boundaries

提示注入防御、高风险操作审慎处理、安全意识（SQL 注入等常见漏洞）、范围边界控制。

### Section 3: Output & Communication

回答风格（简洁直接）、错误恢复策略、任务收尾验证规范。

### Section 4: Tool Usage Guidelines

各工具类别使用指南：`bash`、`read/write/edit`、`grep/find/ls`、编排工具（`task_delegate`、
`agent_call`、`review_call`、`write_todos`、`clarify_request`）。

### Section 5: Workflow Guidance

按任务复杂度的执行路径：
- **简单任务**：直接使用工具
- **中等任务**：内联规划 + `agent_task`/`task_delegate`
- **复杂任务**：`clarify_request` → `write_todos` → `task_delegate` → `review_call`

### Section 6: Phase Discipline

5 阶段模型：`Clarify → Plan → Execute → Verify → Conclude`。
每个阶段职责与约束，以及阶段跨越声明（`[Phase: Execute]`）。

### Section 7: Complexity Routing

3 级复杂度路由：
- **Direct**：单文件无歧义，直接使用工具
- **Lightweight**：2-3 文件，有清晰范围，内联规划
- **Full Pipeline**：跨模块/设计决策，建计划 + 委派 + 审查

### Section 8: Review Guidelines

审查触发条件（架构变更、跨模块修改、不确定时触发，打字错误/简单修复不触发）；
审查失败后向实现方反馈 → 重新触发审查的闭环流程。

### Section 9: Model Slot Guidance

任务委派时的 slot 选择：`normal`、`thinking`、`compact`、`critique`、`vision`。

### Section 10: File State Refresh

会话上下文过长时，通过 `capture_file_state` 工具刷新工作区文件快照。

---

## Sub Agent (Worker) Prompt v1

Worker Agent 的系统提示词由 `assemblePreset({ preset: 'subagent', profile, context })` 拼接。
`SubAgentPromptContext` 包含三个字段：`taskTitle`、`taskDescription`、`taskFiles`（可选）。

### 组装方式

`sub-agent-prompt.ts` 的 `assembleSubAgentPrompt(profile, context)` 将 profile 模板中的
占位符 `{task_title}`、`{task_description}`、`{task_files}` 替换为实际值（缺省为 `'not provided'`）。

### 可配置字段（来自 `agents.<name>` settings）

- `system_prompt`：自定义 prompt 前置文本（覆盖 profile 模板）
- `tools`：允许调用的工具 allowlist
- `max_tool_turns`：最大工具轮次
- `slot`：模型 slot 绑定（`normal` / `thinking` / `compact` / `critique` / `vision`）

---

## 运行时装配流程

### Lead Agent 装配时序

```
1. VitaminApp.start()
   ├── PromptManager.assemble()       → 拼接 lead guidance sections
   └── hookRegistry.emit('system-prompt.transform')
       └── phaseContext hook           → 注入运行时上下文
           └── 每轮 turn 前重新执行

2. AgentSession.promptRefresh()
   ├── 检查 prompt 版本是否过期
   ├── 若过期 → 重新 assemble + transform
   └── 更新 agent.systemPrompt
```

### Sub Agent 装配时序

```
1. TaskExecutor.dispatch(args)
   ├── taskStore.create(input)
   └── runSession({ prompt, agentName, slot })

2. VitaminApp.createSession(agentName, slot)
  ├── 读取 settings.agents[agentName]
  ├── 应用 system_prompt / tools / max_tool_turns（若配置）
  ├── resolveAgentProfile → 匹配 profile → 注入 SubAgentPromptContext
  ├── promptRefresh() = assemblePreset({ preset: 'subagent', profile, context })
  └── new AgentSession({ systemPrompt, tools: filtered })

3. Sub Agent 开始执行
  └── 工具调用 → 完成 → 返回 output.text → session 结束
```

### 热更新能力

| 维度 | 支持情况 | 机制 |
|------|---------|------|
| Lead guidance sections | ✅ 每轮 | PromptManager cache invalidation + reassemble |
| Lead runtime context | ✅ 每轮 | system-prompt.transform hook |
| Sub agent profile | ⚠️ 部分支持 | 从 SettingsManager `agents.<name>` 动态读取 |
| Tool allow list | ⚠️ 部分支持 | `agents.<name>.tools` 过滤，不是 profile-template 映射 |
| Model slot | ✅ 每次 dispatch | 透传到 session |
| Lesson injection | ✅ 每轮 | LessonInjection 匹配 tags → append |

---

## 与外部框架的关键差异

Vitamin 采用 Claude Code 模式：`write_todos` 是纯 UI/记忆工具，`task_delegate` 直接通过 prompt + subagent/category 分发，不经过结构化 plan 状态链路。这与主流框架的 todo/checklist 模式一致，区别主要在于 agent profile 模板系统和 per-session prompt 隔离。

| 维度 | Vitamin | 主流框架（Claude Code / Codex 等） |
|------|---------|--------------------------------------|
| **计划主载体** | `write_todos` 内存 todo 列表 | todo list / checklist |
| **LLM 可调用 planning 工具** | `write_todos`（纯 UI/记忆） | `TodoWrite` / `write_todos` |
| **是否有 typed execution plan CRUD** | 无 | 无 |
| **Task dispatch** | `task_delegate(prompt, subagent/category)` | prompt-based dispatch |
| **子代理上下文注入** | `SubAgentPromptContext`（taskTitle/taskDescription/taskFiles） | prompt 文本直传 |
| **Agent profile 系统** | 8 个内置 profile + 模板占位符替换 | 通常由 prompt 文本定义角色 |

---

## 文件结构

```
packages/prompt/
├── prompts/
│   ├── lead-guidance.md              → 主代理 system prompt（10 sections 合并单文件）
│   └── lesson/
│       └── session-end-learning.md   → Lesson 注入模板
├── src/
│   ├── prompt-manager.ts             → assemble() 加载整体 lead-guidance
│   ├── prompt-factory.ts             → createPromptProvider
│   ├── prompt-cache.ts               → 缓存 + 版本管理
│   ├── sub-agent-prompt.ts           → SubAgentPromptContext + 模板组装
│   ├── local-provider.ts             → 文件系统 Markdown 加载
│   ├── remote-provider.ts            → 远程 prompt 加载
│   ├── environment-context.ts        → 运行环境上下文
│   ├── phase-context.ts              → 阶段上下文注入
│   ├── lesson-injection.ts           → Lesson 匹配注入
│   ├── constants.ts
│   ├── types.ts
│   └── index.ts
└── tests/
```
