# @vitamin/shared

Common utilities shared across all Vitamin packages: logger, filesystem helpers, path utils, typed event emitter, error hierarchy, JSON/HTTP helpers, markdown processing, and subscription system.

## Installation

```bash
pnpm add @vitamin/shared
```

## Usage

```typescript
import { createLogger, TypedEventEmitter, ConfigError, Subscription } from '@vitamin/shared'

const log = createLogger('my-module')
log.info('started')

throw new ConfigError('Missing config', { code: 'CONFIG_MISSING' })
```

## Key Exports

| Export | Description |
|--------|-------------|
| `createLogger`, `getRootLogger`, `attachLogListener` | Structured logger (pino-based) |
| `mkdirp`, `rimraf`, `exists`, `mime`, `isFile`, `isDirectory` | Filesystem helpers |
| `normalizePath`, `getVitaminHomeDir`, `getVitaminProjectDir`, `getThirdPartyToolDir`, `getThirdPartyToolBinaryDir` | Path utilities |
| `createTempLoggerDir`, `createTempLoggerPath` | Temp log path helpers |
| `TypedEventEmitter` | Generic typed event emitter |
| `Subscription`, `BusSubscription` | Pub/sub event subscription system |
| `ConfigError`, `ProviderError`, `OAuthError`, `StreamError`, `AgentError`, `ToolError`, `HookError`, `SessionError`, `ExtensionError`, `McpError` | Error hierarchy |
| `createDisposable`, `createAsyncDisposable`, `DisposableStack`, `AsyncDisposableStack` | Resource cleanup |
| `formatBytes`, `truncateLine`, `truncateHead`, `truncateTail` | Text truncation helpers |
| `slugify` | String utility |
| `request`, `stream` | HTTP & SSE helpers |
| `parseJsonc`, `safeStringify` | JSON/JSONC helpers |
| `createMarkdownProcessor`, `createGfmProcessor`, `createFrontmatterProcessor` | Markdown AST processor factories |
| `getNodeText`, `extractBoldLabels`, `extractInlineCodes`, `countChecks`, `extractFrontmatter`, `extractBodyFromAst` | Markdown AST helpers |

## Types

`Brand`, `DeepPartial`, `DeepReadonly`, `Awaitable`, `VoidCallback`, `AsyncVoidCallback`, `Disposable`, `AsyncDisposable`, `Events`, `HttpRequestOptions`, `HttpResponse`, `SseEvent`, `MarkdownProcessor`, `MdastPosition`, `MdastNode`, `YamlNode`, `RootNode`

## License

See [root README](../../README.md) for details.
