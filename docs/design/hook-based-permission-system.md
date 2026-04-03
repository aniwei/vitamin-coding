# Vitamin 基于 Hook 的权限体系设计方案

## 1. 背景与动机

### 1.1 行业现状

通过对主流 Agent 框架的权限模型分析：

| 框架 | 权限模型 | 核心机制 |
|------|---------|---------|
| **Open Agent SDK** (codeany) | Tool allow/deny list + permissionMode | `allowedTools`, `disallowedTools`, `permissionMode` (bypassPermissions / dontAsk / acceptEdits / plan), `canUseTool` callback |
| **gstack** (Garry Tan) | Skill-level safety hooks | `/careful` (破坏性命令警告), `/freeze` (目录锁定), `/guard` (组合安全), `disable-model-invocation` 阻止自动调用 |
| **Deep Agents** (LangChain) | Trust-the-LLM + sandbox boundary | 在 tool/sandbox 层强制边界，不依赖模型自律；sandbox 级隔离 |
| **Pi Mono** (badlogic) | Agent runtime + tool calling state | `session_before` emit typing, per-agent state management |
| **InfiAgent** (polyuiislab) | Call Graph + allowed_tools per agent | `hierarchy_manager` 维护调用关系图，每个 agent 声明 `allowed_tools`，防止越界调用 |
| **OpenDev** | Workflow slot binding + compound AI | 5 workflow slots 独立绑定模型，per-agent tool access |
| **Superpowers** (obra) | Skill 自动触发 + review gate | 技能自动检测+审查门控，review 阶段阻断 |

### 1.2 Vitamin 现状

当前 Vitamin 已有的权限相关能力（零散分布，未形成体系）：

- **ToolRegistry**: `ToolPreset` (minimal / standard / full) 预设过滤 + `excludeByNames`
- **HookRegistry**: `file-guard` hook 阻止写入受保护路径
- **SettingStore**: `disabled_tools`, `disabled_agents`, `disabled_hooks` 配置项（声明但未完全连接执行）
- **SkillRegistry**: `disabledSet` 禁用技能
- **MCP Manager**: `disabledServers` 禁用 MCP 服务
- **Orchestrator**: `WorkflowOptions` 中 review/retry/circuitBreaker 开关

**核心问题**: 这些能力各自独立，缺少统一的策略层和运行时决策引擎。

### 1.3 设计目标

1. **Hook-native**: 权限判定完全通过 `@vitamin/hooks` 的 `tool.execute.before` / `chat.message.before` 等时机执行，不引入独立运行时
2. **声明式策略**: 用 `PermissionPolicy` 对象描述 "谁可以做什么"，而非在各处硬编码
3. **可组合**: 多条策略可叠加（deny-first / allow-first / priority 排序）
4. **零破坏性迁移**: 现有 `file-guard`、`disabled_tools` 等语义向后兼容
5. **运行时可观测**: 每次决策产出结构化审计日志

---

## 2. 核心概念

### 2.1 Permission Policy（权限策略）

```typescript
interface PermissionPolicy {
  /** 策略唯一名称 */
  name: string
  /** 策略优先级 (数值越小越先执行) */
  priority: number
  /** 策略是否启用 */
  enabled: boolean
  /** 适用范围 */
  scope: PolicyScope
  /** 规则列表 (按顺序评估) */
  rules: PermissionRule[]
}

interface PolicyScope {
  /** 适用的 agent 名称，'*' 表示所有 */
  agents?: string[]
  /** 适用的 session ID 模式 */
  sessions?: string[]
}
```

### 2.2 Permission Rule（权限规则）

```typescript
type RuleEffect = 'allow' | 'deny' | 'ask'

interface PermissionRule {
  /** 规则名称 (调试用) */
  name: string
  /** 判定结果 */
  effect: RuleEffect
  /** 匹配条件 */
  match: RuleMatch
  /** 人工确认提示文案 (effect='ask' 时) */
  askPrompt?: string
  /** 拒绝时附带的原因 */
  denyReason?: string
}

interface RuleMatch {
  /** 工具名称 glob 模式, e.g. ['write', 'edit', 'bash'] */
  tools?: string[]
  /** 文件路径 glob/regex 模式 */
  paths?: (string | RegExp)[]
  /** 参数条件 (JSONPath-like) */
  args?: Record<string, unknown>
  /** 自定义断言函数 */
  condition?: (context: PermissionContext) => boolean
}
```

### 2.3 Permission Context（判定上下文）

```typescript
interface PermissionContext {
  /** 当前 Hook Timing */
  timing: HookTiming
  /** 工具名称 */
  toolName: string
  /** 工具参数 */
  args: Record<string, unknown>
  /** 当前 agent 名称 */
  agentName: string
  /** 当前 session ID */
  sessionId: string
  /** 提取的文件路径 (如有) */
  filePath?: string
  /** 附加元数据 */
  metadata: Record<string, unknown>
}
```

### 2.4 Permission Decision（判定结果）

```typescript
interface PermissionDecision {
  /** 最终结果 */
  effect: RuleEffect
  /** 命中的策略名 */
  policyName: string
  /** 命中的规则名 */
  ruleName: string
  /** 拒绝原因 */
  reason?: string
  /** 时间戳 */
  timestamp: number
  /** 评估的策略数量 */
  evaluatedPolicies: number
}
```

---

## 3. 架构设计

### 3.1 系统分层

```
┌─────────────────────────────────────────────────────┐
│                  Setting Layer                       │
│  VitaminSettingFromSchema.permissions: PolicyConfig  │
└──────────────────────┬──────────────────────────────┘
                       │ 加载
┌──────────────────────▼──────────────────────────────┐
│               Policy Registry                        │
│  PermissionPolicyRegistry                            │
│  - register(policy) / unregister(name)              │
│  - evaluate(context) → PermissionDecision           │
│  - getEffective(agentName) → PermissionPolicy[]     │
└──────────────────────┬──────────────────────────────┘
                       │ 注入
┌──────────────────────▼──────────────────────────────┐
│             Hook Execution Layer                     │
│  createPermissionGuardHook()                         │
│    → timing: 'tool.execute.before', priority: 5     │
│  createMessageGuardHook()                            │
│    → timing: 'chat.message.before', priority: 5     │
│  createAgentBoundaryHook()                           │
│    → timing: 'task.started', priority: 5            │
└──────────────────────┬──────────────────────────────┘
                       │ 发出
┌──────────────────────▼──────────────────────────────┐
│             Audit & Observability                    │
│  createPermissionAuditHook()                         │
│    → timing: 'tool.execute.after'                   │
│  PermissionAuditLog (in-memory ring buffer)          │
└─────────────────────────────────────────────────────┘
```

### 3.2 执行流程

```
tool.execute.before (priority=5)
       │
       ▼
  PermissionGuardHook
       │
       ├─ 1. 构建 PermissionContext
       │     (toolName, args, agentName, sessionId, filePath)
       │
       ├─ 2. PolicyRegistry.evaluate(context)
       │     │
       │     ├─ 遍历所有 enabled 策略 (按 priority 升序)
       │     ├─ 对每个策略: 检查 scope 是否匹配当前 agent/session
       │     ├─ 对每个规则: 逐条评估 match 条件
       │     ├─ 首个命中的规则 → 返回 PermissionDecision
       │     └─ 无命中 → 继续下一个策略
       │
       ├─ 3. 处理 Decision
       │     ├─ effect='allow' → 放行 (不修改 output)
       │     ├─ effect='deny'  → output.cancelled=true, throw ToolError
       │     └─ effect='ask'   → 设置 metadata.requiresConfirmation=true
       │
       └─ 4. 记录审计日志
             PermissionAuditLog.record(context, decision)
```

### 3.3 Default-Deny 语义

策略评估采用 **first-match** 语义:
- 策略按 `priority` 升序排列
- 每个策略内部 `rules` 按数组顺序评估
- 第一个 `match` 命中的规则即为最终判定
- **所有策略都无命中** → 默认 `allow`（保持向后兼容）

可通过注册一个 catch-all deny 策略实现 default-deny:

```typescript
{
  name: 'default-deny',
  priority: 9999,
  enabled: true,
  scope: { agents: ['*'] },
  rules: [{ name: 'deny-all', effect: 'deny', match: {}, denyReason: 'No explicit permission' }]
}
```

---

## 4. 核心实现

### 4.1 PermissionPolicyRegistry

```typescript
export class PermissionPolicyRegistry {
  private policies: PermissionPolicy[] = []

  register(policy: PermissionPolicy): void {
    this.unregister(policy.name)
    this.policies.push(policy)
    this.policies.sort((a, b) => a.priority - b.priority)
  }

  unregister(name: string): boolean {
    const idx = this.policies.findIndex(p => p.name === name)
    if (idx >= 0) { this.policies.splice(idx, 1); return true }
    return false
  }

  evaluate(context: PermissionContext): PermissionDecision {
    let evaluated = 0
    for (const policy of this.policies) {
      if (!policy.enabled) continue
      if (!matchesScope(policy.scope, context)) continue
      evaluated++

      for (const rule of policy.rules) {
        if (matchesRule(rule.match, context)) {
          return {
            effect: rule.effect,
            policyName: policy.name,
            ruleName: rule.name,
            reason: rule.effect === 'deny' ? rule.denyReason : undefined,
            timestamp: Date.now(),
            evaluatedPolicies: evaluated,
          }
        }
      }
    }

    // 无匹配 → 默认放行
    return {
      effect: 'allow',
      policyName: '__default__',
      ruleName: '__fallthrough__',
      timestamp: Date.now(),
      evaluatedPolicies: evaluated,
    }
  }

  /** 获取对指定 agent 生效的策略列表 */
  getEffective(agentName: string): PermissionPolicy[] {
    return this.policies.filter(p =>
      p.enabled && matchesScopeAgent(p.scope, agentName)
    )
  }
}
```

### 4.2 Permission Guard Hook

```typescript
export function createPermissionGuardHook(
  registry: PermissionPolicyRegistry,
  auditLog?: PermissionAuditLog,
): HookRegistration<'tool.execute.before'> {
  const handle = (
    input: ToolExecuteBeforeInput,
    output: ToolExecuteBeforeOutput,
  ): void => {
    const context: PermissionContext = {
      timing: 'tool.execute.before',
      toolName: input.toolName,
      args: input.args,
      agentName: input.agentName,
      sessionId: input.sessionId,
      filePath: extractPath(input.args),
      metadata: {},
    }

    const decision = registry.evaluate(context)
    auditLog?.record(context, decision)

    if (decision.effect === 'deny') {
      output.cancelled = true
      output.cancelReason = `Permission denied: ${decision.reason ?? decision.ruleName}`
      throw new ToolError(output.cancelReason, { code: 'PERMISSION_DENIED' })
    }

    if (decision.effect === 'ask') {
      // 在 metadata 中标记需要用户确认，由上层 UI 处理
      output.metadata = {
        ...output.metadata,
        requiresConfirmation: true,
        confirmationPrompt: decision.reason,
        permissionDecision: decision,
      }
    }
  }

  return {
    name: 'permission-guard',
    timing: 'tool.execute.before',
    priority: 5, // 在 file-guard (10) 之前执行
    enabled: true,
    handle,
  }
}
```

### 4.3 Agent Boundary Hook

限制 agent 只能使用其声明的 `tools` 列表（类似 InfiAgent 的 call-graph），通过 `task.started` 时机动态注入:

```typescript
export function createAgentBoundaryHook(
  agentToolMap: Map<string, Set<string>>,
  registry: PermissionPolicyRegistry,
): HookRegistration<'task.started'> {
  const handle = (input: { task: Record<string, unknown>; agent: string }): void => {
    const agentName = input.agent
    const allowedTools = agentToolMap.get(agentName)

    if (allowedTools) {
      // 为该 agent 动态注册一个 scoped policy
      registry.register({
        name: `agent-boundary:${agentName}`,
        priority: 20,
        enabled: true,
        scope: { agents: [agentName] },
        rules: [
          {
            name: 'allow-declared-tools',
            effect: 'allow',
            match: { tools: [...allowedTools] },
          },
          {
            name: 'deny-undeclared-tools',
            effect: 'deny',
            match: {},
            denyReason: `Agent "${agentName}" is not authorized to use this tool`,
          },
        ],
      })
    }
  }

  return {
    name: 'agent-boundary',
    timing: 'task.started',
    priority: 5,
    enabled: true,
    handle,
  }
}
```

### 4.4 Permission Mode

参考 Open Agent SDK 的 `permissionMode`，提供预设安全级别:

```typescript
export type PermissionMode =
  | 'bypass'      // 跳过所有权限检查 (开发模式)
  | 'auto'        // 自动判定: 读操作放行, 写操作按策略
  | 'confirm'     // 所有写操作需人工确认
  | 'strict'      // 所有操作按策略, 无匹配则 deny
  | 'readonly'    // 仅允许读取类工具

const READONLY_TOOLS = new Set([
  'read', 'glob', 'grep', 'list-dir', 'search', 'view-image',
])

export function createPermissionModePolicy(mode: PermissionMode): PermissionPolicy {
  switch (mode) {
    case 'bypass':
      return {
        name: 'mode:bypass',
        priority: 1,
        enabled: true,
        scope: { agents: ['*'] },
        rules: [{ name: 'allow-all', effect: 'allow', match: {} }],
      }
    case 'readonly':
      return {
        name: 'mode:readonly',
        priority: 1,
        enabled: true,
        scope: { agents: ['*'] },
        rules: [
          { name: 'allow-reads', effect: 'allow', match: { tools: [...READONLY_TOOLS] } },
          { name: 'deny-writes', effect: 'deny', match: {}, denyReason: 'Read-only mode' },
        ],
      }
    case 'confirm':
      return {
        name: 'mode:confirm',
        priority: 1,
        enabled: true,
        scope: { agents: ['*'] },
        rules: [
          { name: 'allow-reads', effect: 'allow', match: { tools: [...READONLY_TOOLS] } },
          { name: 'ask-writes', effect: 'ask', match: {} },
        ],
      }
    case 'strict':
      // strict 模式不注册 catch-all allow，需要显式策略
      return {
        name: 'mode:strict',
        priority: 9999,
        enabled: true,
        scope: { agents: ['*'] },
        rules: [{ name: 'deny-unmatched', effect: 'deny', match: {}, denyReason: 'Strict mode: no matching policy' }],
      }
    case 'auto':
    default:
      return {
        name: 'mode:auto',
        priority: 1,
        enabled: true,
        scope: { agents: ['*'] },
        rules: [
          { name: 'allow-reads', effect: 'allow', match: { tools: [...READONLY_TOOLS] } },
        ],
      }
  }
}
```

---

## 5. 内置策略集

### 5.1 向后兼容: File Guard 策略

将现有 `file-guard` hook 的语义迁移为声明式策略:

```typescript
export const FILE_GUARD_POLICY: PermissionPolicy = {
  name: 'builtin:file-guard',
  priority: 10,
  enabled: true,
  scope: { agents: ['*'] },
  rules: [
    {
      name: 'protect-system-paths',
      effect: 'deny',
      match: {
        tools: ['write', 'edit', 'edit-diff', 'bash'],
        paths: [
          /^\/etc\//, /^\/usr\//, /^\/sys\//, /^\/proc\//,
          /node_modules\//, /\.git\//,
          /\.env$/, /\.env\.local$/,
        ],
      },
      denyReason: 'Write to protected system path is not allowed',
    },
  ],
}
```

### 5.2 Destructive Command Guard

参考 gstack 的 `/careful` 模式:

```typescript
export const DESTRUCTIVE_COMMAND_POLICY: PermissionPolicy = {
  name: 'builtin:destructive-guard',
  priority: 15,
  enabled: true,
  scope: { agents: ['*'] },
  rules: [
    {
      name: 'ask-destructive-bash',
      effect: 'ask',
      match: {
        tools: ['bash'],
        condition: (ctx) => {
          const command = String(ctx.args.command ?? '')
          return /\b(rm\s+-rf|drop\s+table|git\s+push\s+--force|git\s+reset\s+--hard|truncate\s+table)\b/i.test(command)
        },
      },
      askPrompt: 'This command may be destructive. Continue?',
    },
  ],
}
```

### 5.3 Directory Freeze

参考 gstack 的 `/freeze` 功能:

```typescript
export function createDirectoryFreezePolicy(allowedDir: string): PermissionPolicy {
  return {
    name: 'builtin:directory-freeze',
    priority: 8,
    enabled: true,
    scope: { agents: ['*'] },
    rules: [
      {
        name: 'allow-within-directory',
        effect: 'allow',
        match: {
          tools: ['write', 'edit', 'edit-diff'],
          condition: (ctx) => {
            const filePath = ctx.filePath ?? ''
            return filePath.startsWith(allowedDir)
          },
        },
      },
      {
        name: 'deny-outside-directory',
        effect: 'deny',
        match: { tools: ['write', 'edit', 'edit-diff'] },
        denyReason: `Edits frozen to directory: ${allowedDir}`,
      },
    ],
  }
}
```

### 5.4 Tool Preset 策略

将 `ToolPreset` 语义提升为策略:

```typescript
export function createToolPresetPolicy(
  preset: ToolPreset,
  toolPresetMap: Map<string, ToolPreset>,
): PermissionPolicy {
  const allowedPresets = PRESET_INCLUDES[preset]

  return {
    name: `builtin:tool-preset:${preset}`,
    priority: 30,
    enabled: true,
    scope: { agents: ['*'] },
    rules: [
      {
        name: 'deny-excluded-tools',
        effect: 'deny',
        match: {
          condition: (ctx) => {
            const toolPreset = toolPresetMap.get(ctx.toolName)
            return toolPreset !== undefined && !allowedPresets.has(toolPreset)
          },
        },
        denyReason: `Tool not available in "${preset}" preset`,
      },
    ],
  }
}
```

---

## 6. 配置集成

### 6.1 Setting Schema 扩展

在 `VitaminSettingFromSchema` 中增加:

```typescript
interface VitaminSettingFromSchema {
  // ... 现有字段 ...

  /** 权限模式: bypass | auto | confirm | strict | readonly */
  permission_mode?: PermissionMode

  /** 自定义权限策略 */
  permissions?: PermissionPolicyConfig[]
}

interface PermissionPolicyConfig {
  name: string
  priority?: number
  enabled?: boolean
  scope?: {
    agents?: string[]
    sessions?: string[]
  }
  rules: PermissionRuleConfig[]
}

interface PermissionRuleConfig {
  name: string
  effect: 'allow' | 'deny' | 'ask'
  tools?: string[]
  paths?: string[]          // glob 模式，运行时编译为 RegExp
  deny_reason?: string
  ask_prompt?: string
}
```

### 6.2 配置示例 (vitamin.yaml)

```yaml
# 权限模式
permission_mode: auto

# 自定义策略
permissions:
  - name: project-boundary
    priority: 20
    rules:
      - name: allow-project-writes
        effect: allow
        tools: [write, edit, edit-diff]
        paths: ["src/**", "tests/**"]
      - name: deny-config-writes
        effect: deny
        tools: [write, edit]
        paths: ["*.config.*", "package.json"]
        deny_reason: "Config files are read-only"
      - name: ask-bash
        effect: ask
        tools: [bash]
        ask_prompt: "Execute shell command?"

  - name: agent-isolation
    priority: 25
    scope:
      agents: [web-search-agent]
    rules:
      - name: allow-search-tools
        effect: allow
        tools: [web-search, web-fetch, read, grep]
      - name: deny-others
        effect: deny
        deny_reason: "web-search-agent can only use search tools"
```

---

## 7. Hook 时机映射

| Hook Timing | 权限用途 | 内置 Hook |
|---|---|---|
| `tool.execute.before` | **工具执行前** — 核心权限检查点 | `permission-guard` (priority=5) |
| `chat.message.before` | 消息发送前 — 可用于内容策略 | `message-guard` (priority=5) |
| `task.started` | 任务启动时 — 注入 agent 边界策略 | `agent-boundary` (priority=5) |
| `session.created` | 会话创建时 — 加载 session-scoped 策略 | `session-policy-loader` (priority=5) |
| `tool.execute.after` | 工具执行后 — 审计日志 | `permission-audit` (priority=90) |

---

## 8. 审计与可观测性

### 8.1 Audit Log

```typescript
interface PermissionAuditEntry {
  timestamp: number
  sessionId: string
  agentName: string
  toolName: string
  filePath?: string
  decision: PermissionDecision
}

export class PermissionAuditLog {
  private entries: PermissionAuditEntry[] = []
  private readonly maxEntries: number

  constructor(maxEntries = 1000) {
    this.maxEntries = maxEntries
  }

  record(context: PermissionContext, decision: PermissionDecision): void {
    this.entries.push({
      timestamp: decision.timestamp,
      sessionId: context.sessionId,
      agentName: context.agentName,
      toolName: context.toolName,
      filePath: context.filePath,
      decision,
    })
    // ring buffer
    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(-this.maxEntries)
    }
  }

  getEntries(filter?: { sessionId?: string; effect?: RuleEffect }): PermissionAuditEntry[] {
    let result = this.entries
    if (filter?.sessionId) result = result.filter(e => e.sessionId === filter.sessionId)
    if (filter?.effect) result = result.filter(e => e.decision.effect === filter.effect)
    return result
  }

  getDenyCount(sessionId?: string): number {
    return this.getEntries({ sessionId, effect: 'deny' }).length
  }

  clear(sessionId?: string): void {
    if (sessionId) {
      this.entries = this.entries.filter(e => e.sessionId !== sessionId)
    } else {
      this.entries = []
    }
  }
}
```

### 8.2 DevTools 集成

通过 `@vitamin/devtools` 暴露:

- `GET /debug/permissions` — 查看当前生效的策略列表
- `GET /debug/permissions/audit?sessionId=xxx` — 查看审计日志
- `GET /debug/permissions/evaluate` — 模拟评估（dry-run）

---

## 9. 接入方式

### 9.1 Preset 集成

在 `HookRegistry` 中新增 preset 层级:

```typescript
// 现有 preset 增加权限 hooks
function getPresetHooks(preset: HookPreset): HookRegistration[] {
  // ... 现有 hooks ...

  if (preset !== 'none') {
    // 所有非 'none' 预设都包含权限 guard
    hooks.push(
      createPermissionGuardHook(policyRegistry, auditLog),
    )
  }
  if (preset === 'strict') {
    hooks.push(
      createPermissionGuardHook(policyRegistry, auditLog),
      createAgentBoundaryHook(agentToolMap, policyRegistry),
    )
  }
}
```

### 9.2 运行时连接

```typescript
// coding/src/app.ts 或 service 初始化处
const policyRegistry = new PermissionPolicyRegistry()
const auditLog = new PermissionAuditLog()

// 1. 注册 permission mode 策略
const mode = settings.get('permission_mode') ?? 'auto'
policyRegistry.register(createPermissionModePolicy(mode))

// 2. 注册内置策略
policyRegistry.register(FILE_GUARD_POLICY)
policyRegistry.register(DESTRUCTIVE_COMMAND_POLICY)

// 3. 注册 disabled_tools 策略
const disabledTools = settings.get('disabled_tools') ?? []
if (disabledTools.length > 0) {
  policyRegistry.register({
    name: 'setting:disabled-tools',
    priority: 2,
    enabled: true,
    scope: { agents: ['*'] },
    rules: [{
      name: 'deny-disabled',
      effect: 'deny',
      match: { tools: disabledTools },
      denyReason: 'Tool disabled by configuration',
    }],
  })
}

// 4. 注册用户自定义策略
const userPolicies = settings.get('permissions') ?? []
for (const config of userPolicies) {
  policyRegistry.register(compilePolicyFromConfig(config))
}

// 5. 注册 hook
hookRegistry.register(createPermissionGuardHook(policyRegistry, auditLog))
```

---

## 10. 迁移路径

### Phase 1: 核心框架 (当前)
- [ ] 实现 `PermissionPolicyRegistry` + `PermissionContext` + 匹配引擎
- [ ] 实现 `createPermissionGuardHook`
- [ ] 将 `file-guard` 语义迁移为 `FILE_GUARD_POLICY`（保留原 hook 作为 fallback）
- [ ] 实现 `PermissionAuditLog`

### Phase 2: 配置集成
- [ ] `VitaminSettingFromSchema` 增加 `permission_mode` 和 `permissions`
- [ ] 实现 `compilePolicyFromConfig` (YAML → Policy)
- [ ] 连接 `disabled_tools` / `disabled_agents` 到策略引擎

### Phase 3: Agent 边界
- [ ] 实现 `createAgentBoundaryHook`
- [ ] 从 `AgentConfig.tools` 构建 `agentToolMap`
- [ ] 编排器中 `task.started` 时自动注入边界策略

### Phase 4: 可观测性
- [ ] DevTools 路由
- [ ] Web UI 权限面板
- [ ] `PermissionMode` 运行时切换

---

## 11. 与现有系统关系

| 现有组件 | 迁移策略 |
|---------|---------|
| `file-guard` hook | Phase 1 后作为 `FILE_GUARD_POLICY` 的 fallback，Phase 2 后可移除原 hook |
| `ToolRegistry.getAvailable(preset)` | 保持原功能不变 (编译期过滤)，权限策略是运行时补充 |
| `disabled_tools` setting | Phase 2 自动转换为 deny 策略 |
| `disabled_agents` setting | Phase 3 转换为 agent scope deny 策略 |
| `disabled_hooks` setting | 不迁移 (hook 启禁是独立于权限的运维能力) |
| `SkillRegistry.disabledSet` | Phase 2 统一到 deny 策略 |
| `MCP disabledServers` | Phase 2 统一到 deny 策略 (tool name 为 `mcp_<server>_*`) |
| `WorkflowOptions` 开关 | 不迁移 (工作流控制，非安全权限) |

---

## 12. 设计决策记录

| 决策 | 选择 | 理由 |
|------|------|------|
| 权限评估引擎放在哪里 | Hook 内 (非独立运行时) | 复用 HookRegistry 的 priority/disable/fail-open 机制，无新依赖 |
| 默认行为 | allow (无策略匹配时放行) | 向后兼容，不打破现有用户体验 |
| 策略评估顺序 | first-match (按 priority) | 简单可预测，与 hook priority 语义一致 |
| `ask` effect 如何实现 | 设置 metadata，由 UI 层消费 | 权限层不耦合 UI 实现 |
| 是否引入 RBAC | 否 (仅 scope-based) | Agent 框架场景下 role 概念弱，scope (agent/session) 已足够 |
| condition 函数是否允许 async | 否 (同步) | 权限判定必须低延迟，不应执行 I/O |
