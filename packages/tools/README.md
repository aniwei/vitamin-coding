# @vitamin/tools

Tool registry with 26+ built-in tools organized into three presets: minimal (4 tools), standard (10 tools), and full (26+ tools).

## Installation

```bash
pnpm add @vitamin/tools
```

## Usage

```typescript
import { createToolRegistry, createReadTool, createWriteTool, createBashTool } from '@vitamin/tools'

const registry = createToolRegistry()
registry.register(createReadTool())
registry.register(createWriteTool())
registry.register(createBashTool({ cwd: process.cwd() }))
```

## Key Exports

### Registry

| Export | Description |
|--------|-------------|
| `ToolRegistry`, `createToolRegistry` | Tool management and lookup |
| `validateToolArgs` | Zod-based argument validation |

### Minimal Preset (4 tools)

`createReadTool`, `createWriteTool`, `createEditTool`, `createBashTool`

### Standard Preset (+6 tools)

`createGrepTool`, `createGlobTool`, `createFindTool`, `createLsTool`, `createAstGrepTool`, `createDelegateTaskTool`

### Full Preset (+12 tools)

- **Advanced editing**: `createEditDiffTool`, `createHashlineEditTool`, `createLookAtTool`, `createInteractiveBashTool`
- **Orchestration**: `createStartWorkTool`, `createBackgroundOutputTool`, `createBackgroundCancelTool`, `createCallAgentTool`
- **Skills**: `createSkillExecutorTool`, `createSkillMcpTool`, `createSkillLoaderTool`
- **Session**: `createSessionManagerTool`
- **Tasks**: `createTaskCreateTool`, `createTaskGetTool`, `createTaskListTool`, `createTaskUpdateTool`

## License

See [root README](../../README.md) for details.
