# @vitamin/agent

Agent state machine with dual-loop execution, tool calling, abort support, and structured error handling.

## Installation

```bash
pnpm add @vitamin/agent
```

## Usage

```typescript
import { createAgent, agentLoop } from '@vitamin/agent'

const agent = createAgent({
  model: 'claude-sonnet-4-20250514',
  tools: myTools,
  systemPrompt: 'You are a helpful assistant.',
})

const result = await agentLoop({ agent, messages: [{ role: 'user', content: 'Hello' }] })
```

## Key Exports

| Export | Description |
|--------|-------------|
| `Agent`, `createAgent` | Agent class and factory |
| `createAgentWithRegistry` | Factory with built-in ProviderRegistry |
| `agentLoop` | Main agent execution loop |
| `createToolExecutor` | Tool call executor |
| `AgentLoopError`, `ToolExecutionError`, `AbortError`, `MaxToolTurnsError` | Error types |

## Types

`AgentStatus`, `AgentMode`, `AgentEvent`, `ToolCallEvent`, `AgentMessage`, `AgentState`, `AgentLoopConfig`, `AgentTool`, `ToolResult`, `AgentConfig`, `AgentEventListener`

## Build Behavior

- Source keeps development assertions (`invariant` from `@vitamin/invariant`) in `src/agent.ts`.
- When building with `NODE_ENV=production`, `tsup` strips those assertion blocks from emitted JS.
- When building with `NODE_ENV=development` (or unset), assertions remain in output.

## License

See [root README](../../README.md) for details.
