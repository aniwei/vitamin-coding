# @vitamin/hooks 设计说明

## 设计目标

- 提供 Agent 生命周期各阶段可插拔的拦截和变换机制。
- 内置权限策略体系，实现操作级别的安全守卫。
- 支持 31 种 Hook 时机，涵盖会话、工具防护、变换、质量、流、压缩、后台等 7 个类别。

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
