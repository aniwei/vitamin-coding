# @vitamin/coding 设计说明

## 设计目标

- 作为应用装配层，将所有子系统组合成完整的 Vitamin 编码助手。
- 管理 `VitaminApp`（依赖注入容器）和 `AgentSession`（单次对话生命周期）。
- 提供 `CodingSessionManager` 管理多个 AgentSession 的创建、持久化与回收。
- 实现四种运行模式（interactive / print / json / rpc），对接 CLI 和 Service 层。

## 非目标

- 不直接实现子系统能力（所有能力由子包提供，本包负责组合）。
- 不负责 HTTP/WebSocket 传输层（由 `@vitamin/service` 完成）。

## 实现原理

### VitaminApp（app/vitamin-app.ts）

实现 `VitaminContext` 接口，作为整个系统的依赖注入容器：

**初始化流程（12个阶段）**：

```
1.  SettingLoader.load()              → VitaminSetting
2.  ModelRegistry + ModelSlot 解析    → slot → model 映射
3.  ProviderRegistry                  → AI 提供商工厂注册
4.  AuthStore                         → API 凭证
5.  ToolRegistry + 内置工具注册       → 按 preset 配置
6.  HookRegistry + 内置 Hook 注册     → 权限守卫/质量检查/压缩等
7.  PermissionPolicyRegistry          → 权限策略装配
8.  PromptManager                     → 系统提示模板加载
9.  MemoryManager + PersistentMemory  → 记忆管理
10. OperationalLearningStore          → 经验学习存储
11. SkillRegistry.discover()          → 技能文件扫描
12. McpManager 连接 MCP 服务器        → 工具/资源/提示适配
```

**TIER_TO_SLOT 模型映射**：

```typescript
const TIER_TO_SLOT: Record<string, ModelSlot> = {
  fast: 'compact', // 快速响应（补全/简单任务）
  standard: 'normal', // 标准任务（默认）
  powerful: 'thinking', // 复杂任务（深度思考）
}
```

**动态权限工具集**：`createPermissionToolSetsFromRegistry(toolRegistry)` 根据当前 `PermissionPolicyRegistry` 动态生成三类工具子集（read-only / dryrun / full），供 Agent 按权限模式选择可用工具。

### AgentSession（session/agent-session.ts）

单次对话的完整生命周期管理器：

**启动前装配**：

1. 从 `VitaminApp` 获取所有依赖（hook registry / tool registry / prompt manager 等）
2. 装配系统提示：`promptManager.assemblePreset()` + memory 注入 + skill 目录 + 环境上下文
3. 创建 `Agent` 实例（注入 toolSet / hooks / model / streamOptions）
4. 注册工具网关（approval / askUser / planApproval 覆盖 Agent 默认工具）

**事件桥接**：

`AgentSession` 监听 `Agent` 发出的 40+ 种内部事件（`stream_event` / `tool_call_start` / `tool_call_end` / `turn_start` / `turn_end` / `message_start` / `message_end` 等），重新发射为 `AgentSession` 事件，供 Service 层订阅。

**会话持久化**：

每次 Agent 完成一轮后，调用 `InMemorySession.append()` 写入消息，触发 `SessionManager.save()` 快照到磁盘。

**资源回收**：

`abort()` → 取消 Agent `AbortController` → 清理所有事件监听器 → `SessionManager.evict()` 回收空闲会话。

### CodingSessionManager（coding-session-manager.ts）

多会话容器管理，委托给 `@vitamin/session` 的 `SessionManager`：

| 实现类                         | 持久化方式       |
| ------------------------------ | ---------------- |
| `InMemoryCodingSessionManager` | 内存（无持久化） |
| `DiskCodingSessionManager`     | 文件系统         |
| `RemoteCodingSessionManager`   | HTTP 远程存储    |

接口：`create()` / `get()` / `delete()` / `list()` / `fork(sessionId)` / `listPaginated()`

`fork(sessionId)` 调用 `InMemorySession.branchAt()` 从指定消息创建分支会话，实现"从历史节点重新开始"的功能。

### 运行模式（run/）

| 模式          | 实现类              | 用途                                   |
| ------------- | ------------------- | -------------------------------------- |
| `interactive` | `InteractiveRunner` | 交互式 REPL，持续读取 stdin 输入       |
| `print`       | `PrintRunner`       | 单次执行，文本输出到 stdout，然后退出  |
| `json`        | `JsonRunner`        | 单次执行，JSON 格式输出（含事件流）    |
| `rpc`         | `RpcRunner`         | JSON-RPC 模式，供父进程通过 stdin 控制 |

### 内置 Hook 装配（hooks/）

`VitaminApp.registerBuiltinHooks()` 在初始化时注册以下 Hook：

- **auto-compaction**：自动触发 memory 压缩（`messages.transform`）
- **environment-injection**：向消息注入系统环境上下文（`messages.transform`）
- **tool-filter**：按权限模式过滤可用工具（`chat.params`）
- **thinking-validator**：校验 thinking block（`messages.transform`）
- **token-budget**：动态调整 maxTokens（`chat.params`）
- **stream-metrics**：统计流式指标（`stream.start` / `stream.end`）

## 调用链路

### 完整会话创建与执行流程

```
CLI / Service
       │
  VitaminApp.create(config)
       │
  初始化12个子系统...
       │
  app.createSession(options)
       │
  AgentSession.init()
  ├── 装配系统提示（prompt + memory + skill + env）
  ├── 创建 Agent 实例
  └── 注册工具网关
       │
  session.chat(userMessage)
       │
  Agent.run(context, signal)
       │
  workLoop → runTurn → stream → runTools → ...
       │
  AgentSession 接收事件 → 转发给 Service/Runner
       │
  完成后：
  ├── Session.append(messages)
  ├── SessionManager.save()
  └── 若需要：MemoryManager.compact()
```

### fork（分支会话）流程

```
CodingSessionManager.fork(sessionId, entryId)
       │
  SessionManager.get(sessionId) → InMemorySession
       │
  session.branchAt(entryId) → newBranchSession
       │
  CodingSessionManager.create() 注册新会话
       │
  新 AgentSession 从分支历史继续
```

## 模块分层

| 文件/目录                               | 职责                                              |
| --------------------------------------- | ------------------------------------------------- |
| `src/types.ts`                          | VitaminAppConfig / AgentSessionOptions 等类型     |
| `src/app/vitamin-app.ts`                | 依赖注入容器（12个子系统装配）                    |
| `src/session/agent-session.ts`          | 对话生命周期（系统提示/事件桥/工具网关/持久化）   |
| `src/session/coding-session-manager.ts` | 多会话管理（InMemory / Disk / Remote）            |
| `src/hooks/`                            | 内置 Hook 装配（auto-compaction / env-inject 等） |
| `src/run/interactive.ts`                | 交互式 REPL                                       |
| `src/run/print.ts`                      | Print 模式                                        |
| `src/run/json.ts`                       | JSON 模式                                         |
| `src/run/rpc.ts`                        | RPC 模式（JSON-RPC stdin/stdout）                 |
| `src/index.ts`                          | barrel 导出                                       |

## 入口与依赖

- **入口**：`src/index.ts`
- **内部依赖**：`@vitamin/agent`、`@vitamin/ai`、`@vitamin/hooks`、`@vitamin/tools`、`@vitamin/session`、`@vitamin/setting`、`@vitamin/persistence`、`@vitamin/prompt`、`@vitamin/memory`、`@vitamin/resources`、`@vitamin/skill`、`@vitamin/mcp`、`@vitamin/devtools`、`@vitamin/shared`、`@vitamin/env`、`@vitamin/invariant`
- **外部依赖**：无

## 测试策略

- 测试文件数：5+
- 覆盖：VitaminApp 初始化装配、AgentSession 生命周期（启动/聊天/中止）、运行模式输出格式、会话管理器 CRUD。

## 非目标

- 不直接实现子系统能力（所有能力由子包提供，本包负责组合）。
- 不负责 HTTP/WebSocket 传输层（由 `@vitamin/service` 完成）。

## 实现原理

### VitaminApp（vitamin-app.ts）

应用级依赖注入容器，负责所有子系统的创建与装配：

初始化阶段：

1. 创建 SettingLoader → 加载配置
2. 创建 ModelRegistry + ProviderRegistry + AuthStore
3. 创建 ToolRegistry → 注册内置工具 → 设置预设
4. 创建 HookRegistry → 注册内置 Hook
5. 创建 PermissionPolicyRegistry → 注册权限策略
6. 创建 PromptManager（系统提示模板管理）
7. 创建 MemoryManager + PersistentMemory
8. 创建 OperationalLearningStore（经验学习）
9. 创建 SkillRegistry → 发现本地技能
10. 创建 McpManager → 连接 MCP 服务器
11. 动态派生权限工具集：`createPermissionToolSetsFromRegistry(toolRegistry)`

公开方法：

- `createSession(options)` → AgentSession
- `getToolRegistry()` / `getHookRegistry()` / `getModelRegistry()` 等访问器

### AgentSession（agent-session.ts）

单次对话的完整生命周期管理：

1. **初始化**：从 VitaminApp 获取所有依赖，创建 Agent 实例
2. **消息持久化**：维护 InMemorySession，持久化到 SessionStore
3. **工具协调**：注入 approval / askUser / planApproval 网关
4. **系统提示装配**：通过 PromptManager 组装系统提示（含环境上下文、记忆注入、技能提示）
5. **执行循环**：调用 agent.run()，转发所有事件到上层（40+ 事件类型）
6. **资源回收**：abort + 清理所有监听器

事件桥接：将 Agent 内部事件（stream_event / tool_call_start 等）转发为 AgentSession 事件，供 Service 层订阅。

### CodingSessionManager（coding-session-manager.ts）

多会话容器管理：

- `InMemoryCodingSessionManager`：纯内存管理
- `DiskCodingSessionManager`：基于文件持久化
- `RemoteCodingSessionManager`：基于远程 HTTP 持久化

支持 `create()` / `get()` / `delete()` / `list()` / `fork()`，委托给 SessionManager。

### 运行模式（run/）

- `PrintRunner`：单次执行，文本输出到 stdout
- `JsonRunner`：JSON 格式输出
- `RpcRunner`：JSON-RPC 模式
- `InteractiveRunner`：交互式 REPL

## 实现流程

```
CLI / Service --> VitaminApp.create(config)
                       |
                  初始化所有子系统
                       |
                  app.createSession(options)
                       |
                  AgentSession
                       |
                  session.chat(userMessage)
                       |
                  1. 系统提示装配（prompt + memory + skill + env context）
                  2. agent.run(context)
                  3. 事件流转发到调用方
                  4. 消息持久化
                       |
                  返回 AssistantMessage
```

## 模块分层

| 文件                            | 职责                                           |
| ------------------------------- | ---------------------------------------------- |
| `src/types.ts`                  | VitaminAppConfig / AgentSessionOptions 等类型  |
| `src/vitamin-app.ts`            | 应用容器（依赖注入 + 子系统装配）              |
| `src/agent-session.ts`          | 对话生命周期（消息持久化 + 事件桥 + 工具网关） |
| `src/coding-session-manager.ts` | 多会话管理（InMemory / Disk / Remote）         |
| `src/run/print.ts`              | Print 模式                                     |
| `src/run/json.ts`               | JSON 模式                                      |
| `src/run/rpc.ts`                | RPC 模式                                       |
| `src/run/interactive.ts`        | 交互式 REPL                                    |
| `src/index.ts`                  | barrel 导出                                    |

## 入口与依赖

- **入口**：`src/index.ts`
- **内部依赖**：`@vitamin/agent`、`@vitamin/ai`、`@vitamin/hooks`、`@vitamin/tools`、`@vitamin/session`、`@vitamin/setting`、`@vitamin/persistence`、`@vitamin/prompt`、`@vitamin/memory`、`@vitamin/resources`、`@vitamin/skill`、`@vitamin/mcp`、`@vitamin/devtools`、`@vitamin/shared`、`@vitamin/env`、`@vitamin/invariant`
- **外部依赖**：无

## 测试策略

- 测试文件数：5+
- 覆盖：VitaminApp 创建、AgentSession 生命周期、运行模式、会话管理器
