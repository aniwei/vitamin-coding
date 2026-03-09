# @vitamin/ai

Unified AI provider abstraction supporting Anthropic, OpenAI (completions + responses), Google Generative AI, GitHub Copilot, Ollama, and AWS Bedrock. Includes streaming, fallback chains, model resolution, and cost calculation.

## Installation

```bash
pnpm add @vitamin/ai
```

## Usage

```typescript
import { createProviderRegistry, createAnthropicProvider, stream } from '@vitamin/ai'

const registry = createProviderRegistry()
registry.register('anthropic', createAnthropicProvider({ apiKey: process.env.ANTHROPIC_API_KEY }))

const events = stream({ provider: registry.get('anthropic'), model: 'claude-sonnet-4-20250514', messages })
for await (const event of events) {
  console.log(event)
}
```

## Key Exports

| Export | Description |
|--------|-------------|
| `stream`, `complete`, `streamSimple` | Streaming / completion entry points |
| `createProviderRegistry`, `ProviderRegistry` | Provider management |
| `createAnthropicProvider` | Anthropic Messages API adapter |
| `createOpenAICompletionsProvider` | OpenAI Chat Completions adapter |
| `createOpenAIResponsesProvider` | OpenAI Responses API adapter |
| `createGoogleProvider` | Google Generative AI adapter |
| `createOllamaProvider` | Ollama local model adapter |
| `createBedrockProvider` | AWS Bedrock Converse adapter |
| `createCopilotProvider` | GitHub Copilot adapter (OpenAI-compatible + Copilot auth) |
| `createModelRegistry`, `BUILTIN_MODELS` | Model registry and built-in definitions |
| `EventStream`, `createEventStream` | Streaming event abstraction |

## Types

`Message`, `StreamEvent`, `ToolDefinition`, `Model`, `ModelCost`, `ThinkingLevel`, `Usage`, `StopReason`, `ProviderAdapter`, `ProviderFactory`, `StreamOptions`

## License

See [root README](../../README.md) for details.
