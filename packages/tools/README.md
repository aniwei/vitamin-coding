# @vitamin/tools

Tool registry for Vitamin agents.

Current built-in preset composition:
- `minimal`: 4 tools
- `standard`: 8 tools (`minimal` + 4)
- `full`: 10 tools (`standard` + 2)

## Installation

```bash
pnpm add @vitamin/tools
```

## Usage

```typescript
import { createToolRegistry } from '@vitamin/tools'

const registry = createToolRegistry(process.cwd(), {
	dispatchTask: async () => ({
		success: false,
		error: 'dispatchTask not implemented',
	}),
	performWork: async () => ({
		success: false,
		error: new Error('performWork not implemented'),
	}),
})

const toolsForStandardPreset = registry.getAvailable('standard')
```

## Key Exports

### Registry

| Export | Description |
|--------|-------------|
| `ToolRegistry`, `createToolRegistry` | Tool management and lookup |
| `validateToolArgs` | Zod-based argument validation |

### Built-in Presets

#### Minimal (4)

- `read`: 读取文件内容，支持 offset/limit。
- `write`: 写入文件，默认自动创建父目录。
- `edit`: 基于 oldContent/newContent 的文本替换。
- `bash`: 执行 shell 命令并返回输出。

#### Standard (+4)

- `ls`: 列出目录内容。
- `find`: 按模式查找文件（可注入 glob 或使用 fd）。
- `grep`: 文本检索（依赖 rg 执行器）。
- `task_delegate`: 把任务委派给子代理执行。

#### Full (+2)

- `agent_call`: 调用指定代理并返回结果。
- `perform_work`: 启动计划执行。

## Notes

- `createToolRegistry(projectRoot, options)` requires orchestration callbacks in `options`.
- Presets are cumulative: `minimal ⊂ standard ⊂ full`.
- Search tools that rely on external binaries (such as `grep`/`find` fallback) require the corresponding executors to be available.

## License

See [root README](../../README.md) for details.
