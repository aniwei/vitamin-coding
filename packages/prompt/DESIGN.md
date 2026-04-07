# @vitamin/prompt 设计说明

## 设计目标

- 管理系统提示模板的加载、缓存与组装。
- 支持本地文件系统和 HTTP 两种提示源。
- 提供子 Agent 提示组装和环境上下文注入能力。

## 非目标

- 不负责提示的执行（由 `@vitamin/agent` 完成）。
- 不管理模型选择（由 `@vitamin/ai` 完成）。

## 实现原理

### PromptManager（prompt-manager.ts）

提示管理的核心协调器：
- `getSystemPrompt(profile, context)` → 组装完整系统提示
- `getSubAgentPrompt(profile, task)` → 子 Agent 特化提示
- `resolve(name)` → 按名称解析模板
- 内置缓存层（PromptCache），支持 TTL 和手动失效

### 提示提供者

- `LocalPromptProvider`：从文件系统读取 prompt 模板（`.vitamin/prompts/` 或内置 `prompts/` 目录）
- `HttpPromptProvider`：从 HTTP 端点加载远程模板

### 系统提示组装流程

系统提示由多段内容拼接：
1. **基础模板**：Agent Profile 对应的角色描述和行为指引
2. **环境上下文**：workspace 目录、git 分支/状态、操作系统信息
3. **记忆注入**：AGENTS.md 内容、经验教训
4. **技能提示**：匹配的 SKILL.md 指令
5. **工具列表**：当前可用工具的描述
6. **自定义指令**：用户配置的额外指令

### Agent Profile 解析（profile-resolver.ts）

- `resolveProfile(name)`：精确名称匹配
- `fuzzyResolveProfile(query)`：模糊匹配（支持别名、关键词）
- 从 `@vitamin/setting` 的 BUILTIN_AGENT_PROFILES 和用户自定义 agents 中解析

### 环境上下文收集（environment-context.ts）

收集运行时环境信息：
- `getWorkspaceContext()`：当前目录、项目名称
- `getGitContext()`：分支、最近提交、文件状态
- `getSystemContext()`：OS、Node 版本
- 格式化为模板变量供提示插入

### Phase 上下文（phase-context.ts）

支持在提示中注入/提取阶段标记：
- `injectPhaseContext(prompt, phase)` → 插入 `[PHASE:xxx]` 标记
- `extractPhaseContext(prompt)` → 提取阶段信息

### Lesson 注入（lesson-injector.ts）

将经验教训格式化注入提示：
- `formatLessons(lessons)` → Markdown 列表
- `injectLessons(prompt, lessons)` → 在指定位置插入

## 实现流程

```
AgentSession.chat()
       |
  PromptManager.getSystemPrompt(profile, context)
       |
  1. resolveProfile(profile) → 基础模板
  2. getEnvironmentContext() → 环境变量
  3. context.memories → 记忆内容
  4. context.skills → 技能指令
  5. context.tools → 工具描述
  6. injectLessons() → 经验教训
       |
  模板占位符替换 → 完整系统提示
       |
  返回 systemPrompt string

子 Agent 提示组装：
  PromptManager.getSubAgentPrompt(profile, task)
       |
  基础模板 + 任务描述 + 作用域限制
       |
  返回 subAgentSystemPrompt
```

## 模块分层

| 文件 | 职责 |
|------|------|
| `src/types.ts` | PromptTemplate / PromptContext / ProfileConfig 类型 |
| `src/prompt-manager.ts` | 提示管理与组装协调 |
| `src/prompt-cache.ts` | 模板缓存（TTL） |
| `src/local-prompt-provider.ts` | 文件系统提示源 |
| `src/http-prompt-provider.ts` | HTTP 提示源 |
| `src/profile-resolver.ts` | Agent Profile 精确/模糊解析 |
| `src/environment-context.ts` | 环境上下文收集 |
| `src/phase-context.ts` | Phase 标记注入/提取 |
| `src/lesson-injector.ts` | 经验教训注入 |
| `src/index.ts` | barrel 导出 |
| `prompts/` | 内置提示模板文件 |

## 入口与依赖

- **入口**：`src/index.ts`
- **内部依赖**：`@vitamin/setting`、`@vitamin/shared`、`@vitamin/env`、`@vitamin/invariant`
- **外部依赖**：无

## 测试策略

- 测试文件数：6
- 覆盖：提示组装、模板解析、Profile 解析、环境上下文、缓存失效、Lesson 注入
