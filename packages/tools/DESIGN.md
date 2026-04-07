# @vitamin/tools 设计说明

## 设计目标

- 提供 Agent 可用工具的注册、分组与发现能力。
- 内置 30+ 工具覆盖文件系统、搜索、Shell、Web、编排、会话、技能、LSP 等 8 个域。
- 支持预设分层（minimal / standard / full），按场景裁剪工具集。

## 非目标

- 不负责工具执行管线（由 `@vitamin/agent` ToolExecutor 完成）。
- 不做权限判定（由 `@vitamin/hooks` PermissionGuardHook 完成）。

## 实现原理

### 工具注册表（tool-registry.ts）

`ToolRegistry` 管理 `AgentTool` 实例的注册与查询：
- `register(tool)`：注册具名工具
- `get(name)` / `has(name)`：按名查询
- `getAll()` / `getEnabled()` / `getByTag(tag)`：批量查询
- `enable(name)` / `disable(name)` / `lock(name)`：启用/禁用/锁定工具
- `setPreset(level)`：按预设批量切换工具状态

预设层级含义：
| 预设 | 包含工具 |
|------|----------|
| `minimal` | 仅只读工具（read/search/ls 等） |
| `standard` | 标准开发工具集（含 write/edit/bash） |
| `full` | 全部工具（含编排/LSP/技能） |

### 内置工具分类

#### 文件系统（fs/）
- `read_file`：读取文件内容（支持行范围 + 二进制偏移）
- `write_file`：写入新文件，自动创建目录
- `edit_file`：基于精确 oldString/newString 的单点替换
- `multi_edit`：批量多文件替换

#### 搜索（search/）
- `list_dir`：列目录内容
- `find_file`：glob/regex 文件查找
- `grep`：文本/正则搜索
- `semantic_search`：语义搜索

#### Shell（shell/）
- `bash`：Shell 命令执行，支持超时/工作目录/AbortSignal

#### Web（web/）
- `web_search`：网络搜索
- `web_fetch`：获取网页正文

#### 编排（orchestration/）
- `task_delegate`：委托给子 Agent
- `write_todos`：任务列表管理
- `agent_call`：调用指定 Agent 配置
- `review_call`：代码审查委托
- `plan_call`：计划制定委托
- `ask_user`：向用户提问
- `plan_approval`：计划审批请求
- `approval`：操作审批请求
- `abort_task`：中止当前任务

#### 会话（session/）
- `session_summary`：获取会话摘要
- `session_history`：获取历史回合

#### 技能（skill/）
- `load_skill`：加载 SKILL.md 技能文件

#### LSP（lsp/）
- `lsp_definition`：跳转定义
- `lsp_references`：查找引用
- `lsp_symbols`：符号搜索
- `lsp_diagnostics`：诊断信息
- `lsp_rename`：重命名符号

### 二进制执行器（binary-executor-registry.ts）

管理第三方二进制工具（ripgrep / find 等）的下载、缓存与按平台执行。`BinaryExecutorRegistry` 支持自动下载和版本管理。

## 实现流程

```
VitaminApp 初始化
       |
  createToolRegistry() --> ToolRegistry
       |
  registerBuiltinTools(registry) --> 30+ 工具注册
       |
  registry.setPreset(preset) --> 按预设启用/禁用
       |
  Agent 运行时 --> ToolExecutor.resolve(toolName)
       |
  registry.get(name) --> AgentTool 实例
       |
  tool.execute(context) --> ToolResult
```

## 模块分层

| 目录/文件 | 职责 |
|----------|------|
| `src/types.ts` | AgentTool / ToolResult / ToolCallContext 类型 |
| `src/tool-registry.ts` | 工具注册表 + 预设管理 |
| `src/binary-executor-registry.ts` | 二进制工具管理 |
| `src/builtin-tools/fs/` | 4 个文件系统工具 |
| `src/builtin-tools/search/` | 4 个搜索工具 |
| `src/builtin-tools/shell/` | 1 个 Shell 工具 |
| `src/builtin-tools/web/` | 2 个 Web 工具 |
| `src/builtin-tools/orchestration/` | 9 个编排工具 |
| `src/builtin-tools/session/` | 2 个会话工具 |
| `src/builtin-tools/skill/` | 1 个技能工具 |
| `src/builtin-tools/lsp/` | 5 个 LSP 工具 |

## 入口与依赖

- **入口**：`src/index.ts`
- **内部依赖**：`@vitamin/agent`（类型）、`@vitamin/shared`、`@vitamin/env`、`@vitamin/invariant`
- **外部依赖**：`zod`

## 测试策略

- 测试文件数：8
- 覆盖：工具注册、预设切换、各类别内置工具行为、二进制执行器
