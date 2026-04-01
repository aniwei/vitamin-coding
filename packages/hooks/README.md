# @vitamin/hooks

运行时生命周期 Hook 模块接入指南。

## 1. 安装

```bash
pnpm add @vitamin/hooks
```

## 2. 你会接入什么

`@vitamin/hooks` 提供两类调用能力：

- 链式 Hook: `execute(timing, input, output)`
- 事件 Hook: `emit(timing, input)`

推荐入口 API：

- `createHookRegistry(options?)`
- `HookRegistry`

兼容别名（已废弃）：

- `createHookEngine`
- `HookEngine`

## 3. 快速接入（最小可用）

```ts
import { createHookRegistry } from '@vitamin/hooks'

const hooks = createHookRegistry({ preset: 'minimal' })

// 在工具执行前
await hooks.execute(
	'tool.execute.before',
	{
		toolName: 'write',
		toolCallId: 'call-1',
		args: { path: 'src/a.ts', content: 'hello' },
		agentName: 'coding',
		sessionId: 's1',
	},
	{
		args: { path: 'src/a.ts', content: 'hello' },
		cancelled: false,
	},
)
```

## 4. 生产接入（推荐）

### 4.1 初始化

```ts
import {
	createHookRegistry,
	createRulesInjectorHook,
	createToolErrorTrackerHook,
	createTokenBudgetHook,
} from '@vitamin/hooks'

const hooks = createHookRegistry({ preset: 'default' })

// 按需追加业务 Hook
hooks.register(createRulesInjectorHook(process.cwd()))
hooks.register(createToolErrorTrackerHook({ circuitBreakerThreshold: 5 }))
hooks.register(createTokenBudgetHook({ maxOutputTokens: 8192 }))
```

### 4.2 在聊天管线中调用

```ts
import type {
	ChatMessageInput,
	ChatMessageOutput,
	MessagesTransformInput,
	MessagesTransformOutput,
	ChatParamsInput,
	ChatParamsOutput,
} from '@vitamin/hooks'

async function beforeChatMessage(hooks: ReturnType<typeof createHookRegistry>, input: ChatMessageInput) {
	const output: ChatMessageOutput = {
		message: input.message,
		cancelled: false,
		metadata: {},
	}
	await hooks.execute('chat.message.before', input, output)
	return output
}

async function transformMessages(hooks: ReturnType<typeof createHookRegistry>, input: MessagesTransformInput) {
	const output: MessagesTransformOutput = { messages: input.messages }
	await hooks.execute('messages.transform', input, output)
	return output
}

async function patchChatParams(hooks: ReturnType<typeof createHookRegistry>, input: ChatParamsInput) {
	const output: ChatParamsOutput = { metadata: {} }
	await hooks.execute('chat.params', input, output)
	return output
}
```

### 4.3 在工具管线中调用

```ts
import type {
	ToolExecuteBeforeInput,
	ToolExecuteBeforeOutput,
	ToolExecuteAfterInput,
	ToolExecuteAfterOutput,
} from '@vitamin/hooks'

async function beforeTool(hooks: ReturnType<typeof createHookRegistry>, input: ToolExecuteBeforeInput) {
	const output: ToolExecuteBeforeOutput = {
		args: { ...input.args },
		cancelled: false,
	}

	await hooks.execute('tool.execute.before', input, output)

	if (output.cancelled) {
		return { blocked: true, reason: output.cancelReason }
	}
	return { blocked: false, args: output.args }
}

async function afterTool(hooks: ReturnType<typeof createHookRegistry>, input: ToolExecuteAfterInput) {
	const output: ToolExecuteAfterOutput = {
		result: input.result,
		metadata: {},
	}
	await hooks.execute('tool.execute.after', input, output)
	return output
}
```

### 4.4 在事件节点调用

```ts
await hooks.emit('session.created', { sessionId: 's1', metadata: {} })
await hooks.emit('stream.start', { sessionId: 's1', model: 'gpt-5.2' })
await hooks.emit('stream.end', { sessionId: 's1', model: 'gpt-5.2', stopReason: 'end_turn' })
await hooks.emit('compaction.before', { sessionId: 's1', messageCount: 120 })
await hooks.emit('compaction.after', { sessionId: 's1', retainedCount: 40 })
await hooks.emit('background.start', { taskId: 'bg-1', agentName: 'coding' })
await hooks.emit('background.end', { taskId: 'bg-1', agentName: 'coding', success: true })
```

## 5. 预设选择建议

| Preset | 内容 | 场景 |
| --- | --- | --- |
| `minimal` | `file-guard` + `output-truncation` | 先上线基础安全边界 |
| `default` | 安全、质量、观测、预算等常用 Hook | 常规生产默认选项 |
| `strict` | `default` + `comment-checker` | 对代码注释质量要求更高 |
| `none` | 不自动注册内置 Hook | 完全自定义 |

## 6. 自定义 Hook 写法

```ts
import { createHookRegistry, type HookRegistration } from '@vitamin/hooks'

const hooks = createHookRegistry({ preset: 'none' })

const custom: HookRegistration<'chat.message.before'> = {
	name: 'my-metadata-hook',
	timing: 'chat.message.before',
	priority: 25,
	enabled: true,
	handler(input, output) {
		output.metadata.sessionId = input.sessionId
		output.metadata.customTag = 'demo'
	},
}

hooks.register(custom)
```

## 7. 运行期运维建议

- 使用 `disable(name)` / `enable(name)` 做灰度开关
- 使用 `getRegistered()` 对齐最终生效的 Hook 列表
- 会话结束时建议清理会话级状态：
	- `clearToolErrors(sessionId)`
	- `clearTokenUsage(sessionId)`
	- `clearStreamMetrics(sessionId)`
	- `clearCompactionStats(sessionId)`
- `clearBackgroundTaskHistory()` 是进程级清理，会清空所有会话/任务的后台历史，不建议在单会话结束时调用。

## 8. 常见接入问题

1. Hook 没有执行
	 - 检查 timing 是否匹配
	 - 检查 `enabled` 是否为 `true`
	 - 检查是否被 `disable(name)` 运行期禁用

2. Hook 执行顺序不符合预期
	 - 检查 `priority`，数值越小越早执行

3. 为什么抛错没有中断整个链路
	 - `HookRegistry` 默认对单个 Hook 失败采取记录日志并继续执行的策略

## 9. 设计文档

技术设计细节见 [DESIGN.md](./DESIGN.md)。

## 10. License

See [root README](../../README.md) for details.
