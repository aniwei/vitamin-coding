# @vitamin/hooks 设计说明

## 设计目标

- 提供 Agent 生命周期各阶段可插拔的拦截和变换机制。
- 内置权限策略体系（PermissionPolicyRegistry），实现工具调用级别的安全守卫。
- 支持 32+ 种 Hook 时机，涵盖消息变换、工具守卫、质量检查、会话事件、流指标等。
- 区分"拦截型 Hook"（Interceptor，可修改输入输出）和"观察型 Hook"（Observer，只读）两种模式。
- 内置丰富的开箱即用 Hook（文件守卫、输出截断、质量检查、Anthropic 参数、背景任务追踪等）。

## 非目标

- 不实现 Agent 执行循环本身（在 `@vitamin/agent` 完成）。
- 不管理工具注册（在 `@vitamin/tools` 完成）。

## 实现原理

### Hook 基础类型（hook-spec.ts）

Hook 分为两类：

**Interceptor**（拦截型）：

```typescript
{
  name: string
  timing: InterceptorTiming   // 如 'tool.execute.before' / 'messages.transform'
  priority: number            // 数字越小优先级越高
  enabled: boolean
  handle(input, output): void | Promise<void>
}
```

`handle` 函数通过直接修改 `output` 对象来变换数据，同时可设置 `output.cancelled = true` 拦截工具执行。

**Observer**（观察型）：

```typescript
{
  name: string
  timing: ObserverTiming      // 如 'session.created' / 'stream.start'
  priority: number
  enabled: boolean
  handle(data): void | Promise<void>
}
```

`defineHook(spec)` 工厂函数统一创建两类 Hook 的 `HookSpec`。

### Hook 注册表（hook-registry.ts）

`HookRegistry` 是 Hook 系统的核心调度器：

- 内部按 `HookTiming` 维护 32 个桶（`Record<HookTiming, HookSpec[]>`），每个桶按 `priority` 排序。
- `register(hookSpec)` → 按时机放入对应桶并按优先级插入。
- `on(timing, name, handler)` → 便捷注册内联 Hook。
- `execute(timing, input, output)` → 按优先级顺序执行拦截型 Hook，短路条件：`output.cancelled === true`。
- `observe(timing, data)` → 执行观察型 Hook。
- `enable(name)` / `disable(name)` / `setEnabled(timing, name, enabled)` → 动态启停 Hook。
- `list()` → 返回所有注册 Hook 的信息摘要（用于调试/devtools 展示）。

**32 种 HookTiming** 按领域：

| 类别     | Timing                                                                                                          |
| -------- | --------------------------------------------------------------------------------------------------------------- |
| 消息变换 | `chat.message.before` / `chat.message.after` / `messages.transform` / `chat.params` / `system-prompt.transform` |
| 工具执行 | `tool.execute.before` / `tool.execute.after`                                                                    |
| 会话事件 | `session.created` / `session.deleted` / `session.idle` / `session.error`                                        |
| 流事件   | `stream.start` / `stream.end`                                                                                   |
| 压缩事件 | `compaction.before` / `compaction.after`                                                                        |
| 后台任务 | `background.start` / `background.end`                                                                           |
| 编排事件 | `task.created` / `task.started` / `task.completed` / `task.failed` / `task.cancelled` / `task.recovered`        |
| 评审事件 | `review.requested` / `review.passed` / `review.failed`                                                          |
| 计划事件 | `plan.created` / `plan.updated` / `plan.task_updated`                                                           |
| 扩展事件 | `extension.loaded` / `extension.error`                                                                          |

### 权限策略系统（core/permission/）

**PermissionPolicyRegistry**：

- 管理 `PermissionPolicy[]`，每个策略定义针对特定工具/操作的允许/拒绝规则。
- `evaluate(context: PermissionContext)` → 依次评估所有策略，返回 `{ effect: 'allow'|'deny'|'ask', reason, ruleName }`。
- 采用"首匹配"原则：第一个明确 deny/ask 的策略生效；无匹配则 allow。

**内置策略（builtin-policies.ts）**：

- `createPermissionModePolicy(mode)` → 按 `auto`/`plan`/`dryrun`/`full` 模式生成策略。
- `createDisabledToolsPolicy(tools)` → 黑名单策略（deny 特定工具调用）。
- `compilePolicyFromSetting(setting)` → 将 `VitaminSetting.permission_policies[]` 编译为策略对象。

**PermissionGuardHook**：

- 注册在 `tool.execute.before`，优先级 5（高优先级，早于其他前置 Hook 执行）。
- `handle(input, output)` → 调用 `registry.evaluate(context)` → `deny` 则设置 `output.cancelled = true` 并抛出 `ToolError('PERMISSION_DENIED')`；`ask` 则在 cancelReason 中标记 `[CONFIRM]`（由 service 层处理确认流程）。

**PermissionAuditLog**：

记录每次权限决策（`record(context, decision)`），提供 `getEntries()` / `clearOldEntries(maxAge)` 接口，用于安全审计和调试。

### 内置 Hook 详解

**工具守卫（core/tool-guard/）**：

- `FileGuardHook`：检查文件操作路径是否在允许目录内，防止跨 workspace 读写。
- `OutputTruncationHook`：工具输出超过 `TOOLS_MAX_OUTPUT_BYTES` 时截断，防止 context 污染。
- `LabelTruncatorHook`：工具调用 label（显示用）超长时截断，改善 UI 展示。
- `ToolErrorTrackerHook`：统计工具错误频率，超过阈值后在提示中注入警告。

**上下文变换（core/transform/）**：

- `ContextInjectorHook`：向消息列表头部注入额外上下文（如 memory、environment 等）。
- `AnthropicEffortHook`：为 Anthropic 模型添加 `thinking_budget` 参数。
- `ThinkingValidatorHook`：检查并修正 thinking block 的合法性（避免空 thinking）。
- `TokenBudgetHook`：根据已用 token 动态调整 `maxTokens`，防止超限截断。

**质量检查（core/quality/）**：

- `BabysittingHook`：检测 Agent 是否陷入重复或无效循环（重复相同工具调用）。
- `RalphLoopHook`：检测特定的低质量循环模式（工具失败后不停重试相同操作）。
- `CommentCheckerHook`：检查代码中是否有违规注释（根据项目规范）。

**会话管理（core/session/）**：

- `FirstMessageVariantHook`：首条消息特殊处理（如添加问候语变体）。
- `IdleContinuationHook`：会话空闲时自动续接或清理。
- `SessionRecoveryHook`：会话错误后自动恢复。
- `KeywordDetectionHook`：检测特定关键词并触发对应行为。
- `SessionHistoryHook`：维护会话历史摘要。
- `ErrorRecoveryHook`：工具错误后自动生成恢复建议。

**流指标（core/stream/）**：

- `StreamMetricsHook`：统计流式响应的 TTFT（首 token 时间）、TPS（token/秒）等指标。

**压缩事件（core/compaction/）**：

- `CompactionLoggerHook`：记录压缩事件（before/after）的详细 token 信息。

**后台任务（core/background/）**：

- `BackgroundTrackerHook`：追踪后台任务的启动与完成，提供任务状态概览。

### SafeHook（safe-hook.ts）

将任意 `HookSpec` 包装为错误隔离版本：Hook 执行异常时记录 warn 日志，不向上抛出，保证主流程不中断。

## 调用链路

### 工具执行前的 Hook 链路

```
workLoop.runTools()
       │
  toolExecutor.execute(toolCall, signal)
       │
  hookExecutor.beforeAll(input)  ← ToolHookExecutor（coding/session/hooks.ts）
       │
  HookRegistry.execute('tool.execute.before', input, output)
       │
  按优先级顺序：
  [5]  PermissionGuardHook.handle → 权限检查，deny 则 output.cancelled = true
  [10] FileGuardHook.handle → 路径守卫
  [20] LabelTruncatorHook.handle → 标签截断
  [30] ToolErrorTrackerHook.handle → 错误频率统计
       │
  output.cancelled? → 抛出 ToolError，不执行工具
  否 → tool.execute(args, signal) → ToolResult
       │
  hookExecutor.afterAll(output)
       │
  HookRegistry.execute('tool.execute.after', input, output)
       │
  [10] OutputTruncationHook.handle → 输出截断
       │
  返回 ToolResult
```

### 消息变换 Hook 链路

```
workLoop.runTurn()
       │
  transformContext(messages, signal)   ← AgentSession 注入的 transform 函数
       │
  HookRegistry.execute('messages.transform', { messages }, output)
       │
  按优先级：
  [5]  auto-compaction（内存管理）
  [10] ContextInjectorHook → 注入 memory/environment 上下文
  [20] TokenBudgetHook → 动态调整 maxTokens
       │
  output.messages = 变换后的消息列表
       │
  返回给 runTurn 用于 LLM 调用
```

## 模块分层

| 文件/目录              | 职责                                                       |
| ---------------------- | ---------------------------------------------------------- |
| `src/types.ts`         | HookTiming / HookInput / HookOutput 等核心类型             |
| `src/hook-spec.ts`     | HookSpec / Interceptor / Observer / defineHook 工厂        |
| `src/hook-registry.ts` | HookRegistry 注册表 + 执行引擎（含 32 个时机桶）           |
| `src/safe-hook.ts`     | 错误隔离 Hook 包装器                                       |
| `src/index.ts`         | barrel 导出                                                |
| `src/core/permission/` | 权限策略体系（Registry / GuardHook / AuditLog / 内置策略） |
| `src/core/tool-guard/` | 文件守卫 / 输出截断 / 标签截断 / 错误追踪                  |
| `src/core/transform/`  | 上下文注入 / Anthropic 参数 / thinking 校验 / token 预算   |
| `src/core/quality/`    | babysitting / ralph-loop / 注释检查                        |
| `src/core/session/`    | 首消息变体 / 空闲续接 / 会话恢复 / 关键词检测              |
| `src/core/stream/`     | 流式指标统计                                               |
| `src/core/compaction/` | 压缩日志                                                   |
| `src/core/background/` | 后台任务追踪                                               |

## 入口与依赖

- **入口**：`src/index.ts`
- **内部依赖**：`@vitamin/shared`、`@vitamin/env`、`@vitamin/agent`（类型）
- **外部依赖**：无

## 测试策略

- 测试文件数：7
- 覆盖：HookRegistry 注册/执行/优先级、PermissionPolicyRegistry 评估逻辑、AuditLog 记录、内置策略规则、SafeHook 错误隔离。

## 非目标

- 不实现 Agent 执行循环本身（在 `@vitamin/agent` 完成）。
- 不管理工具注册（在 `@vitamin/tools` 完成）。

## 实现原理

### Hook 注册表（hook-registry.ts）

`HookRegistry` 维护每个 `HookTiming` 到处理器列表的映射（Map<HookTiming, HookHandler[]>）：

- `register(timing, handler, priority?)`：注册 hook，支持优先级排序
- `execute(timing, context)`：按优先级顺序执行已注册的处理器
- `executeWaterfall(timing, initialValue)`：瀑布式执行，上一个处理器输出作为下一个输入

31 种 `HookTiming`：`session:before` / `session:after` / `message:before` / `message:after` / `turn:before` / `turn:after` / `tool:before` / `tool:after` / `tool:validate` / `tool:guard` / `tool:fallback` / `tool:retry` / `context:transform` / `prompt:transform` / `response:transform` / `output:transform` / `quality:review` / `quality:verify` / `quality:reflect` / `stream:chunk` / `stream:error` / `compaction:before` / `compaction:after` / `background:start` / `background:end` 等。

### 权限策略（permission/）

#### PermissionPolicyRegistry（permission-policy-registry.ts）

注册和管理 `PermissionPolicy` 实例。每个策略可以声明针对特定工具和操作的 allow/deny 规则。

#### 策略种类（builtin-policies.ts）

- `FILE_GUARD_POLICY`：文件操作路径守卫
- `DESTRUCTIVE_COMMAND_POLICY`：破坏性 shell 命令拦截
- `createPermissionModePolicy(mode)`：按权限模式（default/strict/minimal/none）生成策略
- `createDirectoryFreezePolicy(dirs)`：冻结指定目录
- `createToolBlacklistPolicy(tools)`：工具黑名单
- `createToolWhitelistPolicy(tools)`：工具白名单
- `createCustomRulePolicy(rules)`：自定义规则策略
- 动态工具集：`createPermissionToolSetsFromRegistry()` 从当前 toolRegistry 动态派生工具分类

#### PermissionAuditLog（permission-audit-log.ts）

记录权限决策审计轨迹（allow/deny/escalate），支持查询和导出。

#### PermissionGuardHook（permission-guard-hook.ts）

将 PermissionPolicyRegistry 集成到 HookRegistry 的 `tool:guard` 时机，拦截不允许的工具调用。

### 内置 Hook（builtin-hooks/）

按类别组织 23+ 内置 Hook：

**会话类（session/）**：

- `SessionInitHook`：会话初始化
- `SessionCleanupHook`：会话清理
- `MessageValidationHook`：消息校验
- `MessageFormattingHook`：消息格式化
- `TurnStartHook`：回合开始
- `TurnEndHook`：回合结束

**工具防护（tool-guard/）**：

- `ToolPreExecutionHook`：工具执行前检查
- `ToolPostExecutionHook`：工具执行后处理
- `ToolValidationHook`：参数校验
- `ToolFallbackHook`：工具失败回退
- `ToolRetryHook`：工具重试策略
- `ToolGuardHook`：权限守卫

**变换（transform/）**：

- `ContextTransformHook`：上下文压缩/变换
- `PromptTransformHook`：系统提示变换
- `ResponseTransformHook`：响应变换
- `OutputTransformHook`：输出格式化

**质量（quality/）**：

- `QualityReviewHook`：质量审查
- `QualityVerifyHook`：结果校验
- `QualityReflectHook`：自检反思

**流（stream/）**：`StreamChunkHook` / `StreamErrorHook`
**压缩（compaction/）**：`CompactionBeforeHook` / `CompactionAfterHook`
**后台（background/）**：`BackgroundStartHook` / `BackgroundEndHook`

### 权限预设（presets.ts）

| 预设      | 说明                                 |
| --------- | ------------------------------------ |
| `default` | 标准模式，保护系统文件和破坏性命令   |
| `strict`  | 严格模式，额外限制网络和文件写入范围 |
| `minimal` | 最小权限，仅允许只读操作             |
| `none`    | 无限制                               |

## 实现流程

```
Agent 执行循环中：
  agent.run() --> work-loop --> 触发各 HookTiming
       |
  HookRegistry.execute(timing, context)
       |
  按优先级遍历 handlers
       |
  handler(context) --> 修改 context / 中止 / 通过
       |
  返回处理后的 context 继续流程

权限守卫流程：
  tool:guard 时机触发
       |
  PermissionGuardHook.handle(context)
       |
  PermissionPolicyRegistry.evaluate(tool, args, operation)
       |
  遍历匹配策略 --> allow / deny / escalate
       |
  AuditLog 记录决策
       |
  deny --> 拦截工具调用
```

## 模块分层

| 文件                                           | 职责                                               |
| ---------------------------------------------- | -------------------------------------------------- |
| `src/types.ts`                                 | HookTiming / HookHandler / PermissionPolicy 等类型 |
| `src/hook-registry.ts`                         | Hook 注册与执行引擎                                |
| `src/permission/permission-policy-registry.ts` | 策略注册与评估                                     |
| `src/permission/permission-audit-log.ts`       | 审计日志                                           |
| `src/permission/permission-guard-hook.ts`      | 权限 -> Hook 集成                                  |
| `src/permission/builtin-policies.ts`           | 7+ 内置策略 + 动态工具集                           |
| `src/permission/presets.ts`                    | 4 种权限预设                                       |
| `src/builtin-hooks/session/`                   | 6 个会话 Hook                                      |
| `src/builtin-hooks/tool-guard/`                | 6 个工具防护 Hook                                  |
| `src/builtin-hooks/transform/`                 | 4 个变换 Hook                                      |
| `src/builtin-hooks/quality/`                   | 3 个质量 Hook                                      |
| `src/builtin-hooks/stream/`                    | 2 个流 Hook                                        |
| `src/builtin-hooks/compaction/`                | 2 个压缩 Hook                                      |
| `src/builtin-hooks/background/`                | 2 个后台 Hook                                      |

## 入口与依赖

- **入口**：`src/index.ts`
- **内部依赖**：`@vitamin/shared`、`@vitamin/invariant`、`@vitamin/env`
- **外部依赖**：无

## 测试策略

- 测试文件数：7
- 覆盖：Hook 注册执行、权限策略评估、审计日志、预设模式、内置 Hook 行为
