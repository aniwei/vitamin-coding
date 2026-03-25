# @vitamin/coding

Vitamin SDK 聚合入口，统一暴露各核心子包能力。

## Installation

```bash
pnpm add @vitamin/coding
```

## Usage

```typescript
import { createSdk } from '@vitamin/coding'

const sdk = createSdk()
const tools = await sdk.tools()
const registry = tools.createToolRegistry(process.cwd(), {
  dispatchTask: async () => ({ success: false, error: 'not implemented' }),
  performWork: async () => ({ success: false, error: new Error('not implemented') }),
})

console.log(registry.getAvailable('minimal').length)
```

## Exports

- `createSdk()`：返回统一 SDK 对象
- `SDK_MODULES`：可用模块清单
- `sdk.agent()` / `sdk.ai()` / `sdk.config()` / `sdk.devtools()` / `sdk.hooks()` / `sdk.orchestrator()` / `sdk.shared()` / `sdk.tools()`

## License

See [root README](../../README.md) for details.
