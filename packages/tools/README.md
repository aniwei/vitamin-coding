# @vitamin/tools

Tool 注册与执行系统，包含 Skill 工具入口。

---

## 目录

- [概述](#概述)
- [架构总览](#架构总览)
- [Tool 系统](#tool-系统)
  - [AgentTool 接口](#agenttool-接口)
  - [ToolRegistry 注册表](#toolregistry-注册表)
  - [预设分层](#预设分层)
  - [内置工具一览](#内置工具一览)
  - [当前限制](#当前限制)
  - [与 @vitamin/orchestrator 的关系](#与-vitaminorchestrator-的关系)
  - [工具参数验证](#工具参数验证)
  - [二进制工具管理](#二进制工具管理)
- [Skill 系统](#skill-系统)
  - [设计理念](#设计理念)
  - [Skill 文件规范](#skill-文件规范)
  - [Skill 发现与加载](#skill-发现与加载)
  - [Skill 注入系统提示词](#skill-注入系统提示词)
  - [Skill 执行流程](#skill-执行流程)
- [Extension 系统（规划）](#extension-系统规划)
  - [Extension 加载器](#extension-加载器)
  - [Extension API](#extension-api)
  - [Extension Runner](#extension-runner)
- [工具执行管线](#工具执行管线)
- [与 pi-mono 的设计对比](#与-pi-mono-的设计对比)
- [安装与使用](#安装与使用)
- [License](#license)

---

## 概述

`@vitamin/tools` 是 Vitamin Agent 框架的工具层，当前提供：

1. **统一的工具注册表** — 管理 Agent 可调用的所有工具，支持分层预设（minimal / standard / full）
2. **内置工具集** — 文件系统、Shell、搜索、编排，以及 Skill 相关工具入口
3. **编排工具回调注入** — 9 个编排 + 2 个 Skill 工具本身是纯壳，实际逻辑由 `@vitamin/orchestrator` 通过 `toToolCallbacks()` 注入（见 [与 @vitamin/orchestrator 的关系](#与-vitaminorchestrator-的关系)）
4. **Skill 工具入口** — 提供 `skill_load` / `skill_execute` 两个工具，实际加载与执行逻辑通过回调注入
5. **Extension 扩展机制**（规划中）— 支持第三方通过 TypeScript 模块注册自定义工具、命令、事件钩子
6. **二进制工具管理** — 自动下载并缓存外部 CLI 二进制（fd、rg 等），跨平台支持

以下文档中：

- “当前实现” 表示仓库中已有代码落地
- “规划方案” 表示基于 vitamin 当前架构与 pi-mono 经验整理的目标设计，尚未在本仓库完整实现

设计参考 [badlogic/pi-mono](https://github.com/badlogic/pi-mono) 的架构经验，在以下关键领域保持对齐：

| 维度 | pi-mono | vitamin |
|------|---------|---------|
| 工具定义 | TypeBox schema + `execute()` | Zod schema + `execute()` |
| 工具注册 | Extension API `registerTool()` | `ToolRegistry.register()` |
| 技能发现 | 文件系统扫描 SKILL.md | `loadSkills()` 文件系统扫描 |
| 技能注入 | XML 格式写入 System Prompt | `formatSkillsForPrompt()` XML 注入 |
| 扩展加载 | jiti 动态导入 TS 模块 | 规划中 — jiti/tsx 动态导入 |
| 钩子 | Extension event handler chain | HookRegistry before/after chain |

---

## 架构总览

```
┌──────────────────────────────────────────────────────────────────────┐
│                          VitaminApp                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐               │
│  │ AgentSession  │  │ AgentSession  │  │ AgentSession  │  ...        │
│  │  ┌────────┐  │  │              │  │              │               │
│  │  │ Agent  │  │  │              │  │              │               │
│  │  │workLoop│  │  │              │  │              │               │
│  │  └───┬────┘  │  │              │  │              │               │
│  └──────┼───────┘  └──────────────┘  └──────────────┘               │
│         │                                                            │
│         ▼                                                            │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │                      ToolExecutor                            │    │
│  │  1. beforeHooks → 2. validate(Zod) → 3. execute → 4. after  │    │
│  └──────────────────────────────┬───────────────────────────────┘    │
│                                 │                                    │
│      ┌──────────────────────────┼──────────────────────┐             │
│      ▼                          ▼                      ▼             │
│  ┌──────────────┐  ┌─────────────────────┐  ┌──────────────────┐    │
│  │ ToolRegistry  │  │ Skill Runtime       │  │ ExtensionRunner  │    │
│  │  minimal (4)  │  │ loadSkills()        │  │     (规划)       │    │
│  │  standard (8) │  │ SkillRegistry       │  │ loadExtensions() │    │
│  │  full (18)    │  │                     │  │ registerTool()   │    │
│  └──┬──────┬────┘  └─────────────────────┘  └──────────────────┘    │
│     │      │                                                         │
│     │      │  回调注入 (registerBuiltinTools)                         │
│     │      │  ┌──────────────────────────────────────────────┐       │
│     │      └──┤ @vitamin/orchestrator                        │       │
│     │         │   toToolCallbacks() 提供 11 个回调:           │       │
│     │         │   AgentRegistry ──── callAgent               │       │
│     │         │   Dispatcher ─────── dispatchTask / create /  │       │
│     │         │                      get / list / update      │       │
│     │         │   BackgroundManager  getOutput / cancel       │       │
│     │         │   PlanLoader ──────── performWork             │       │
│     │         │   SkillAdapter ────── loadSkill / executeSkill│       │
│     │         └──────────────────────────────────────────────┘       │
│     ▼                                                                │
│  ┌──────────────┐  ┌──────────────┐                                  │
│  │BinaryExecutor│  │ SKILL.md     │                                  │
│  │ Registry     │  │ 文件系统扫描  │                                  │
│  │ fd / rg      │  │              │                                  │
│  └──────────────┘  └──────────────┘                                  │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Tool 系统

### AgentTool 接口

所有工具必须实现 `AgentTool<Params>` 接口（定义于 `@vitamin/agent`）：

```typescript
interface AgentTool<Params = unknown> {
  /** 工具名称，LLM function call 使用此名称 */
  name: string
  /** 工具描述，写入 System Prompt 供 LLM 理解 */
  description: string
  /** Zod schema，用于参数验证和类型推导 */
  parameters: ZodType<Params>
  /** 可见性控制 */
  visibility?: 'always' | 'when-enabled' | 'when-requested'
  /** 执行函数 */
  execute(ctx: ToolCallContext<Params>): Promise<ToolResult>
}

interface ToolCallContext<Params> {
  id: string              // 工具调用 ID
  params: Params          // 经 Zod 校验后的参数
  signal: AbortSignal     // 取消信号
  onUpdate?: (update: string) => void  // 流式更新回调
}

interface ToolResult {
  content: (TextContent | ImageContent)[]
  isError?: boolean
  details?: Record<string, unknown>
}
```

### ToolRegistry 注册表

`ToolRegistry` 是工具的中央管理器，职责：

1. **注册/注销** — 管理工具的生命周期
2. **预设过滤** — 按 `minimal / standard / full` 分层过滤
3. **分类查询** — 按 category 检索工具子集
4. **白名单/黑名单** — 精细控制可用工具列表

```typescript
import { createToolRegistry } from '@vitamin/tools'

const registry = createToolRegistry(projectRoot, {
  dispatchTask: async (args) => { /* ... */ },
  performWork: async (name) => { /* ... */ },
  callAgent: async (agent, prompt) => { /* ... */ },
  loadSkill: async (path) => { /* ... */ },
  executeSkill: async (name, input, params) => { /* ... */ },
})

// 获取 standard 预设的所有工具（包含 minimal）
const tools = registry.getAvailable('standard')

// 按分类获取
const fsTools = registry.getByCategory('fs')

// 自定义工具注册
registry.register(myCustomTool, {
  preset: 'standard',
  category: 'custom',
  builtin: false,
})
```

### 预设分层

预设采用**包含关系**设计，高级预设包含所有低级预设的工具：

```
minimal ⊂ standard ⊂ full
```

| 预设 | 工具数量 | 描述 |
|------|---------|------|
| `minimal` | 4 | 核心文件操作 + Shell，适合受限环境 |
| `standard` | 8+6 | + 搜索/导航 + 任务委派 (+ 6 LSP 可选)，日常开发 |
| `full` | 21+7 | + 多 Agent 编排 + 任务管理 + 后台控制 + 澄清通道 + Skill 系统 (+ LSP + Session Manager 可选)，完整能力 |

### 内置工具一览

说明：以下数量与注册状态基于当前 `register-builtin.ts`。

#### Minimal (4)

| 工具 | 分类 | 描述 |
|------|------|------|
| `read` | fs | 读取文件内容，支持 offset/limit 行范围，自动检测图片返回 base64 |
| `write` | fs | 创建/覆盖文件，自动创建父目录 |
| `edit` | fs | 基于 oldContent/newContent 的精确文本替换，含 fuzzy 匹配和 Unicode 归一化 |
| `bash` | shell | 执行 shell 命令，30 秒超时，60KB 输出截断，支持 AbortSignal |

#### Standard (+4, +6 LSP 可选)

| 工具 | 分类 | 描述 |
|------|------|------|
| `ls` | search | 列出目录内容，支持递归模式 |
| `find` | search | 按 glob 模式查找文件，优先使用 fd 二进制，默认返回上限 1000 条 |
| `grep` | search | 文本/正则检索，使用 rg 二进制，支持正则/忽略大小写/上下文行/glob 过滤，默认 100 条匹配上限，长行截断 500 字符 |
| `task_delegate` | orchestration | 将任务委派给子 Agent 执行（同步/后台） |
| `lsp_definition` | lsp | 跳转到定义（需 `enableLsp: true`） |
| `lsp_references` | lsp | 查找引用（需 `enableLsp: true`） |
| `lsp_symbols` | lsp | 文档/工作区符号搜索（需 `enableLsp: true`） |
| `lsp_diagnostics` | lsp | 获取文件诊断信息（需 `enableLsp: true`） |
| `lsp_prepare_rename` | lsp | 验证重命名是否可行（需 `enableLsp: true`） |
| `lsp_rename` | lsp | 执行符号重命名（需 `enableLsp: true`） |

#### Full (+11, +1 Session Manager 可选)

| 工具 | 分类 | 描述 |
|------|------|------|
| `agent_call` | orchestration | 调用指定 Agent，支持 sync（等待结果）/ async（后台执行）模式，可通过 sessionId 复用会话 |
| `perform_work` | orchestration | 执行计划文件的下一个待定步骤（单次调用执行一步，调用方应循环推进），需配合 PlanFileStore |
| `clarify_request` | orchestration | 向父任务/主代理请求补充说明，每个任务有次数限制（默认 3 次），需配合 ClarifyChannel |
| `task_create` | orchestration | 创建任务并提交到 Dispatcher，返回 taskId |
| `task_get` | orchestration | 按 ID 查询任务状态、输出和错误信息 |
| `task_list` | orchestration | 列出任务列表，支持按状态筛选（all / pending / running / completed / error） |
| `task_update` | orchestration | 更新任务：取消（cancel）或重试（retry） |
| `background_output` | orchestration | 获取后台任务的当前状态和输出 |
| `background_cancel` | orchestration | 取消正在运行的后台任务 |
| `skill_load` | skill | 调用外部注入的 Skill 加载回调 |
| `skill_execute` | skill | 调用外部注入的 Skill 执行回调 |
| `session_manager` | session | 会话管理（列出/创建/删除/压缩），需注入 `sessionManager` 回调 |

### 当前限制

- LSP 工具源码已存在（12 个文件），通过 `enableLsp: true` opt-in 注册到 `standard` 预设
- Session Manager 工具已实现（`session-manager.ts`），通过 `sessionManager` 回调 opt-in 注册到 `full` 预设
- MCP 系统已完整实现（Client、Manager、ToolAdapter、Stdio/SSE Transport），按需通过 `MCP Manager` 动态注册
- Skill 运行时已实现（发现、解析、注册、Prompt 注入），但尚未与 `AgentSession` 自动集成 — 需要调用方手动调用 `loadSkills()` + `formatSkillsForPrompt()` 并拼入 systemPrompt

### 与 @vitamin/orchestrator 的关系

编排工具（10 个）和 Skill 工具（2 个）和澄清工具（1 个）本身是纯壳，实际逻辑通过 `RegisterBuiltinOptions` 的回调注入。`@vitamin/orchestrator` 提供了这些回调的完整实现：

**回调注入映射：**

| 回调 | 必填 | orchestrator 来源 | 说明 |
|------|------|------------------|------|
| `dispatchTask` | ✅ | `Dispatcher.dispatch()` | 任务委派，sync/background 两种模式 |
| `callAgent` | ✅ | `AgentRegistry.call()` | 调用指定 Agent，支持 sessionId 复用 |
| `performWork` | ✅ | `PlanLoader` + `Dispatcher` | 按 Markdown 计划文件逐步执行，需 `planFileStore` |
| `loadSkill` | ✅ | `SkillAdapter.load()` | 依赖外部 `SkillAdapter`；未提供时返回错误 |
| `executeSkill` | ✅ | `SkillAdapter.execute()` | 同上 |
| `createTask` | ❌ | `Dispatcher.create()` | 可选；未注入时工具返回 "not available" |
| `getTask` | ❌ | `Dispatcher.get()` → 映射 | 返回 tool-friendly 扁平结构 |
| `listTasks` | ❌ | `Dispatcher.list()` | 支持按状态筛选 |
| `updateTask` | ❌ | `Dispatcher.update()` | cancel / retry 两种操作 |
| `getBackgroundOutput` | ❌ | `BackgroundManager.getOutput()` | 后台任务轮询 |
| `cancelBackground` | ❌ | `BackgroundManager.cancel()` | 协作式取消 |
| `clarifyRequest` | ❌ | `ClarifyChannel.request()` | 可选；需在 OrchestratorOptions 中注入 `clarifyChannel` |

**典型接线方式：**

```typescript
import { createOrchestrator } from '@vitamin/orchestrator'
import { createClarifyChannel } from '@vitamin/orchestrator'
import { registerBuiltinTools } from '@vitamin/tools'

const orchestrator = createOrchestrator({
  sessionFactory,
  toolRegistry,
  hooks,
  planFileStore,     // 可选，performWork 需要
  skillAdapter,      // 可选，skill 工具需要
  clarifyChannel: createClarifyChannel({
    handler: async (req) => {
      // 实现澄清逻辑：转发给 lead agent / 用户 / planner
      return { answer: '...' }
    },
  }),  // 可选，clarify_request 工具需要
})

// orchestrator.toToolCallbacks() 返回全部 12 个回调
registerBuiltinTools(toolRegistry, projectRoot, {
  ...orchestrator.toToolCallbacks(),
  enableLsp: true,                   // opt-in: 注册 6 个 LSP 工具
  sessionManager: mySessionManager,  // opt-in: 注册 session_manager 工具
})
```

详见 `@vitamin/orchestrator` README §6.2（推荐装配方式）和 §12.1（与 @vitamin/tools 的契约）。

### 工具参数验证

使用 Zod schema 进行运行时参数验证：

```typescript
import { validateToolArgs } from '@vitamin/tools'

const result = validateToolArgs(tool.parameters, rawArgs)
if (result.success) {
  // result.data — 经过验证的类型安全参数
} else {
  // result.error — 格式化的错误信息，含字段路径
}
```

### 二进制工具管理

搜索工具依赖外部 CLI 二进制，系统自动管理下载和缓存：

| 二进制 | 版本 | 用途 |
|--------|------|------|
| `fd` | v10.4.2 | `find` 工具的高性能后端 |
| `rg` (ripgrep) | v15.1.0 | `grep` 工具的高性能后端 |

**流程：**
1. 检查 PATH 中是否存在可用版本
2. 检查 `~/.vitamin/tools/` 缓存目录
3. 从 GitHub Releases 自动下载对应平台二进制
4. 支持 Darwin/Linux/Windows × x86_64/ARM64

---

## Skill 系统

> 已实现：`skill_load` / `skill_execute` 工具入口 + `loadSkills()` 发现 + `parseSkillFile()` 解析 + `SkillRegistry` 注册 + `formatSkillsForPrompt()` Prompt 注入。
>
> 尚未自动集成到 `AgentSession`，需要调用方手动拼装。Extension 系统仍为规划中。

### 设计理念

Skill 是可复用的**领域知识包**，以 Markdown 文件形式存储，包含特定任务的专家级指导。Agent 在遇到匹配任务时自动加载 Skill 内容，获得即时的领域上下文。

设计对齐 [Agent Skills 规范](https://agentskills.io)，核心思路参考 pi-mono 的实现。

**与 Tool 的关系：**

```
Tool = 可执行的能力（函数调用）
Skill = 可加载的知识（Prompt 注入 + 可选执行）
```

| 维度 | Tool | Skill |
|------|------|-------|
| 存储形式 | TypeScript 代码 | Markdown 文件 (SKILL.md) |
| 加载方式 | 注册时编程加载 | 规划为运行时文件系统发现 |
| 调用方式 | LLM function call | 规划为 LLM 读取 + 理解后行动 |
| 场景 | 执行操作（读文件、运行命令） | 提供知识（编码规范、调试策略） |

### 当前实现

| 模块 | 文件 | 功能 |
|------|------|------|
| 工具入口 | `skill-load.ts` / `skill-execute.ts` | LLM 可调用的 skill_load / skill_execute 工具 |
| 发现 | `skill-discovery.ts` | `loadSkills()` 递归扫描 `~/.vitamin/skills/` + `<cwd>/.vitamin/skills/` + 显式路径 |
| 解析 | `skill-parser.ts` | `parseSkillFile()` YAML frontmatter 解析 + 校验（名称格式、描述长度） |
| 注册表 | `skill-registry.ts` | `SkillRegistry` 内存注册、冲突检测、prompt-visible 过滤 |
| Prompt | `skill-prompt.ts` | `formatSkillsForPrompt()` 生成 `<available_skills>` XML 片段 |

尚未自动集成：

- `AgentSession` 启动时自动调用 `loadSkills()` + `formatSkillsForPrompt()` 并注入 systemPrompt
- CLI 层面的 `--skill-paths` 参数传递

### Skill 文件规范

Skill 文件使用 YAML frontmatter + Markdown body 格式：

```markdown
---
name: react-component
description: Guidelines for creating React components with TypeScript and hooks
---

# React Component Guidelines

## Structure
- Use functional components with hooks
- Co-locate styles and tests

## Naming
- PascalCase for components
- camelCase for hooks (prefixed with `use`)

## Example
...
```

**Frontmatter 字段：**

| 字段 | 必填 | 规则 |
|------|------|------|
| `name` | 否 | 默认取父目录名。仅 `[a-z0-9-]`，≤ 64 字符，不以连字符开头/结尾，无连续连字符 |
| `description` | 是 | ≤ 1024 字符，用于 LLM 判断是否需要加载此 Skill |
| `disable-model-invocation` | 否 | `true` 时不写入 System Prompt，仅可通过 `/skill:name` 显式调用 |

**目录结构约定：**

```
.vitamin/skills/              # 项目级 Skills
├── react-component/
│   └── SKILL.md
├── testing-strategy/
│   └── SKILL.md
└── deployment.md             # 根级 .md 文件也被识别

~/.vitamin/skills/            # 用户全局 Skills
├── code-review/
│   └── SKILL.md
└── git-workflow/
    └── SKILL.md
```

### Skill 发现与加载

#### 发现规则

```typescript
interface LoadSkillsOptions {
  cwd?: string           // 项目根目录，默认 process.cwd()
  agentDir?: string      // Agent 配置目录，默认 ~/.vitamin
  skillPaths?: string[]  // 显式 Skill 路径（文件或目录）
  includeDefaults?: boolean // 是否包含默认目录，默认 true
}
```

**扫描顺序（优先级从高到低）：**

1. `~/.vitamin/skills/` — 用户全局 Skills （source: `user`）
2. `<cwd>/.vitamin/skills/` — 项目本地 Skills （source: `project`）
3. `skillPaths` 显式路径 — 自定义 Skills（source: `path`）

**目录递归规则**（对齐 pi-mono）：

```
目录扫描逻辑:
  如果目录包含 SKILL.md:
    → 作为 Skill 根，不再递归
  否则:
    → 加载根级 .md 文件（仅第一层）
    → 递归子目录寻找 SKILL.md
  
  跳过: .dotfiles, node_modules
  遵守: .gitignore, .ignore, .fdignore
```

#### 名称冲突解决

同名 Skill 按加载顺序取先到者，后续冲突产生 `collision` 诊断信息：

```typescript
interface LoadSkillsResult {
  skills: Skill[]
  diagnostics: ResourceDiagnostic[]  // 包含 warning / collision 类型
}
```

#### 符号链接

- 符号链接被 follow 并解析为真实路径
- 同一真实路径不会重复加载

### Skill 注入系统提示词

加载的 Skills 以 XML 格式注入 Agent 的 System Prompt，供 LLM 判断何时需要加载：

```xml
The following skills provide specialized instructions for specific tasks.
Use the read tool to load a skill's file when the task matches its description.
When a skill file references a relative path, resolve it against the skill directory
and use that absolute path in tool commands.

<available_skills>
  <skill>
    <name>react-component</name>
    <description>Guidelines for creating React components with TypeScript and hooks</description>
    <location>/path/to/.vitamin/skills/react-component/SKILL.md</location>
  </skill>
  <skill>
    <name>testing-strategy</name>
    <description>Unit and integration testing patterns for the project</description>
    <location>/path/to/.vitamin/skills/testing-strategy/SKILL.md</location>
  </skill>
</available_skills>
```

**LLM 工作流程：**

1. LLM 读取 `<available_skills>` 列表
2. 当用户任务匹配某 Skill 描述时
3. LLM 调用 `read` 工具读取 SKILL.md 的完整内容
4. 按文档指导执行任务

`disable-model-invocation: true` 的 Skill 不会出现在 System Prompt 中。

### Skill 执行流程

当前实现与规划方案需要区分：

- 当前实现：`skill_load` / `skill_execute` 只是对外部回调的工具封装
- 规划方案：在 tools 或 coding 层补齐 Skill 发现、缓存、Prompt 注入和执行编排

Skill 系统提供两个专用工具：

#### skill_load

```typescript
// 注册于 'full' 预设，'skill' 分类
{
  name: 'skill_load',
  parameters: z.object({
    path: z.string()  // SKILL.md 相对路径
  }),
  execute: async ({ params }) => {
    // 当前实现：调用注入的 load(path) 回调
    // 规划实现：在仓内补齐路径解析、frontmatter 校验与 Skill 缓存
  }
}
```

#### skill_execute

```typescript
{
  name: 'skill_execute',
  parameters: z.object({
    name: z.string(),
    input: z.string().optional(),
    parameters: z.record(z.string(), z.string()).optional(),
  }),
  execute: async ({ params }) => {
    // 当前实现：调用注入的 execute(name, input, parameters) 回调
    // 规划实现：从 SkillRegistry 查找并执行已加载 Skill
  }
}
```

**规划中的完整生命周期：**

```
                    发现阶段                        运行时
                    ────────                        ──────
 .vitamin/skills/ ─┐
                    ├─ loadSkills() ─→ Skill[] ─→ formatSkillsForPrompt()
 ~/.vitamin/skills/┘                                ↓
                                              System Prompt
                                                    ↓
                                              LLM 判断需要
                                                    ↓
                                         ┌── read(SKILL.md) ──→ 获得完整指导
                                         │
                                    or   ├── skill_load(path) ──→ 缓存 Skill
                                         │        ↓
                                         └── skill_execute(name, input) ──→ 执行
```

---

## Extension 系统（规划）

> 以下为技术设计方案，尚未实现。参考 pi-mono 的 Extension 系统设计。

Extension 是动态加载的 TypeScript 模块，可在运行时注册工具、订阅事件、添加命令。

### Extension 加载器

**发现位置：**

```
<cwd>/.vitamin/extensions/    # 项目级扩展
~/.vitamin/extensions/        # 全局扩展
配置文件 extensionPaths        # 显式路径
```

**发现规则：**

1. 直接文件：`extensions/*.ts` / `*.js` → 加载
2. 子目录 + index：`extensions/*/index.ts` → 加载
3. 子目录 + package.json：读取 `vitamin.extensions` 字段 → 加载声明的入口
4. 不做深层递归 — 复杂包须通过 package.json 声明

**加载机制：**

```typescript
// 使用 jiti 动态导入 TypeScript 模块（无需预编译）
import { createJiti } from 'jiti'

async function loadExtension(path: string): Promise<Extension> {
  const jiti = createJiti(import.meta.url, {
    moduleCache: false,
    // 预打包情况下用 virtualModules
    // 开发环境用 alias
  })
  const module = await jiti.import(path, { default: true })
  const factory = module as ExtensionFactory
  // factory 接收 ExtensionAPI，注册工具/事件/命令
  const extension = createExtension(path)
  const api = createExtensionAPI(extension, runtime)
  await factory(api)
  return extension
}
```

**Extension 工厂函数签名：**

```typescript
// 扩展入口 — 同步或异步初始化
type ExtensionFactory = (api: ExtensionAPI) => void | Promise<void>

// 示例：extensions/my-tool/index.ts
import { z } from 'zod'

export default function (api: ExtensionAPI) {
  // 注册自定义工具
  api.registerTool({
    name: 'my_linter',
    description: 'Run project linter and return results',
    parameters: z.object({ fix: z.boolean().optional() }),
    async execute(ctx) {
      const result = await runLinter(ctx.params.fix)
      return { content: [{ type: 'text', text: result }] }
    },
  })

  // 订阅事件
  api.on('tool_execution_end', async (event) => {
    if (event.toolName === 'edit') {
      // 文件编辑后自动运行 lint
    }
  })

  // 注册命令
  api.registerCommand('lint', {
    description: 'Run linter on project',
    handler: async (args, ctx) => { /* ... */ },
  })
}
```

### Extension API

规划中的 `ExtensionAPI` 接口：

```typescript
interface ExtensionAPI {
  // ── 工具注册 ──
  registerTool(tool: ToolDefinition): void

  // ── 事件订阅 ──
  on(event: 'tool_call', handler: Handler<ToolCallEvent, ToolCallResult>): void
  on(event: 'tool_result', handler: Handler<ToolResultEvent, ToolResultResult>): void
  on(event: 'agent_start', handler: Handler<AgentStartEvent>): void
  on(event: 'agent_end', handler: Handler<AgentEndEvent>): void
  on(event: 'turn_start', handler: Handler<TurnStartEvent>): void
  on(event: 'turn_end', handler: Handler<TurnEndEvent>): void
  on(event: 'message_start', handler: Handler<MessageStartEvent>): void
  on(event: 'message_end', handler: Handler<MessageEndEvent>): void
  on(event: 'session_start', handler: Handler<SessionStartEvent>): void
  on(event: 'session_shutdown', handler: Handler<SessionShutdownEvent>): void
  on(event: 'resources_discover', handler: Handler<ResourcesDiscoverEvent, ResourcesDiscoverResult>): void

  // ── 命令注册 ──
  registerCommand(name: string, options: CommandOptions): void

  // ── 消息发送 ──
  sendMessage(message: CustomMessage, options?: SendOptions): void
  sendUserMessage(content: string | Content[], options?: SendOptions): void

  // ── 工具查询 ──
  getActiveTools(): string[]
  setActiveTools(toolNames: string[]): void

  // ── 共享事件总线 ──
  events: EventBus
}
```

### Extension Runner

Extension Runner 管理扩展的运行时生命周期：

```typescript
class ExtensionRunner {
  // 收集所有扩展注册的工具
  getAllRegisteredTools(): RegisteredTool[]

  // 按名称查找工具定义
  getToolDefinition(name: string): ToolDefinition | undefined

  // 事件分发 — 按扩展注册顺序执行 handler 链
  async emit(event: ExtensionEvent): Promise<EventResult>

  // 工具调用拦截 — 可取消/修改
  async emitToolCall(event: ToolCallEvent): Promise<ToolCallResult | undefined>

  // 工具结果拦截 — 可修改内容/错误状态
  async emitToolResult(event: ToolResultEvent): Promise<ToolResultResult | undefined>

  // 资源发现 — 扩展可提供额外 skill/prompt/theme 路径
  async emitResourcesDiscover(cwd, reason): Promise<ResourcePaths>
}
```

**与 ToolRegistry 的协作关系：**

```
启动阶段：
  1. loadExtensions(paths) → Extension[]
  2. Extension.registerTool() → 注册到 Extension 对象
  3. ExtensionRunner.getAllRegisteredTools() → 合并到 ToolRegistry
  4. ToolRegistry 同时持有 builtin + extension tools

运行阶段：
  Agent workLoop 获取 tools → ToolExecutor.execute()
    → ExtensionRunner.emitToolCall()     // before 拦截
    → tool.execute()                     // 实际执行
    → ExtensionRunner.emitToolResult()   // after 拦截
```

---

## 工具执行管线

从用户输入到工具执行结果返回的完整流程：

```
User Input
    │
    ▼
AgentSession.prompt(text)
    │
    ├─ session.append(userMessage)
    ├─ session.buildContext() → { messages[] }
    │
    ▼
Agent.run(context)
    │
    ▼
workLoop (双层循环)
    │
    ├─ 外层: followUp 注入循环
    │   │
    │   └─ 内层: steering + tool 执行循环
    │       │
    │       ├─ 1. LLM 调用 (stream)
    │       │   → messages + toolDefinitions → assistantMessage
    │       │
    │       ├─ 2. 解析 tool_calls
    │       │
    │       ├─ 3. 检查 steering messages（可中断）
    │       │
    │       ├─ 4. 执行每个 tool call:
    │       │   │
    │       │   ▼
    │       │   ToolExecutor.execute(toolCall, signal)
    │       │   │
    │       │   ├─ a. hookExecutor.beforeHooks()
    │       │   │   → 可修改 args / 取消执行
    │       │   │
    │       │   ├─ b. validateToolArgs(schema, args)
    │       │   │   → Zod 校验
    │       │   │
    │       │   ├─ c. tool.execute({ id, params, signal })
    │       │   │   → 实际工具逻辑
    │       │   │
    │       │   ├─ d. hookExecutor.afterHooks()
    │       │   │   → 可修改 result
    │       │   │
    │       │   └─ e. 错误包装
    │       │       → catch → { isError: true, content }
    │       │
    │       ├─ 5. append tool_result message
    │       │
    │       └─ 6. 继续内层循环或退出
    │
    ├─ 检查 followUp messages
    │   → 有: append + 继续外层循环
    │   → 无: 退出
    │
    ▼
AgentSession.persistNewMessages()
```

**安全保障：**

- `maxToolTurns`（默认 25）— 防止无限循环
- `AbortSignal` — 全链路取消支持
- 参数验证 — Zod schema 强制校验
- 输出截断 — 60KB / 2000 行上限
- 进程超时 — Shell 命令 30 秒超时

---

## 与 pi-mono 的设计对比

### 工具定义

| | pi-mono | vitamin |
|---|---------|---------|
| Schema | TypeBox (`@sinclair/typebox`) | Zod (`zod`) |
| Execute 签名 | `(toolCallId, params, signal, onUpdate)` | `({ id, params, signal, onUpdate })` |
| Result 类型 | `AgentToolResult<TDetails>` | `ToolResult` |
| UI 渲染 | `renderCall()` / `renderResult()` | 无（headless 优先） |
| Label | 必填（UI 显示） | 无（无 TUI） |
| promptSnippet | 可选（注入 System Prompt 工具描述段） | 通过 description 字段 |
| promptGuidelines | 可选（注入 System Prompt 指南段） | 无 — 通过 Skill 实现 |

### 技能系统

| | pi-mono | vitamin |
|---|---------|---------|
| 文件格式 | YAML frontmatter + Markdown | 同 |
| 发现目录 | `~/.pi/skills/` + `<cwd>/.pi/skills/` | `~/.vitamin/skills/` + `<cwd>/.vitamin/skills/` |
| 名称验证 | `[a-z0-9-]` ≤ 64 字符 | 同 — `parseSkillFile()` 校验 |
| Prompt 注入 | XML `<available_skills>` | 同 — `formatSkillsForPrompt()` |
| 冲突处理 | 先到者胜 + collision 诊断 | 同 — `loadSkills()` + `SkillRegistry` |
| .gitignore 尊重 | 是 | 尚未实现 |
| disableModelInvocation | 是 | 同 — `getPromptVisible()` 过滤 |

### 扩展系统

| | pi-mono（已实现） | vitamin（规划中） |
|---|---------|---------|
| 加载器 | jiti with virtualModules/alias | jiti（同方案） |
| 工厂签名 | `(pi: ExtensionAPI) => void` | `(api: ExtensionAPI) => void` |
| 事件系统 | 30+ 事件类型，handler chain | HookRegistry + Extension events |
| 工具注册 | `pi.registerTool()` → Extension 对象 | `api.registerTool()` → Extension 对象 |
| 命令注册 | `pi.registerCommand()` + 快捷键 | `api.registerCommand()` |
| Provider 注册 | `pi.registerProvider()` 热生效 | 规划中 |
| UI 上下文 | 完整 TUI 控制（dialog, widget, footer） | headless — 无 TUI |
| 资源发现 | `resources_discover` 事件 | 规划中 |
| Session 控制 | 完整（fork, navigate, switch） | 简化版 |

### 差异决策说明

1. **Schema 选型（Zod vs TypeBox）**：Vitamin 选择 Zod 因其 API 更简洁、社区更广泛、tree-shake 更好。代价是与 pi-mono 不直接兼容，需要适配层。

2. **Headless 优先**：Vitamin 不包含 TUI 层，工具定义不含 `renderCall/renderResult`。UI 渲染由上层消费者实现。

3. **Hook vs Extension Event**：Vitamin 当前使用 `HookRegistry` (before/after) 做工具拦截，未来将与 Extension event system 融合 — Extension handler chain 作为 Hook 的超集。

---

## 安装与使用

```bash
pnpm add @vitamin/tools
```

```typescript
import { createToolRegistry } from '@vitamin/tools'

// 创建注册表（自动注册所有内置工具）
const registry = createToolRegistry(process.cwd(), {
  dispatchTask: async (args) => ({ success: false, error: 'not implemented' }),
  performWork: async (name) => ({ success: false, error: new Error('not implemented') }),
  callAgent: async (agent, prompt) => ({ success: false, error: 'not implemented' }),
  loadSkill: async (path) => ({ success: false, error: 'not implemented' }),
  executeSkill: async (name, input, params) => ({ success: false, error: 'not implemented' }),
})

// 获取标准预设工具
const tools = registry.getAvailable('standard')

// 注册自定义工具
registry.register(myTool, { preset: 'standard', category: 'custom' })
```

## Key Exports

| Export | Description |
|--------|-------------|
| `ToolRegistry`, `createToolRegistry` | 工具注册表和工厂 |
| `validateToolArgs` | Zod 参数验证 |
| `RegisteredTool`, `ToolMetadata`, `ToolPreset` | 核心类型 |
| `TaskDispatch`, `CallAgent`, `PerformWork` | 编排回调类型 |

说明：当前包入口尚未导出 `LoadSkill` / `ExecuteSkill` 类型；如需对外暴露，需后续补充到 [packages/tools/src/index.ts](/Users/aniwei/Desktop/workspaces/vitamin-coding/packages/tools/src/index.ts)。

## License

See [root README](../../README.md) for details.
