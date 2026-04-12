# @vitamin/coding 设计说明

## 设计目标

- 作为应用装配层，将各子系统组合成完整的 Vitamin 编码助手。
- 管理 VitaminApp（依赖注入容器）和 AgentSession（单次对话生命周期）。
- 提供 CodingSessionManager 复用和管理多个 AgentSession。

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
