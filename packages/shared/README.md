# @vitamin/shared

Common utilities shared across all Vitamin packages: logger, filesystem helpers, path utils, typed event emitter, error hierarchy, and JSON/HTTP helpers.

## Installation

```bash
pnpm add @vitamin/shared
```

## Usage

```typescript
import { createLogger, readText, TypedEventEmitter, ConfigError } from '@vitamin/shared'

const log = createLogger('my-module')
log.info('started')

const content = await readText('/path/to/file.txt')

throw new ConfigError('Missing config', { code: 'CONFIG_MISSING' })
```

## Key Exports

| Export | Description |
|--------|-------------|
| `createLogger`, `getRootLogger` | Structured logger |
| `readText`, `writeText`, `readdir`, `mkdirp`, `rimraf`, `exists`, `mime` | Filesystem helpers |
| `normalizePath`, `resolvePath` | Path utilities |
| `TypedEventEmitter` | Generic typed event emitter |
| `ConfigError`, `ProviderError`, `OAuthError`, ... | Error hierarchy |
| `createDisposable`, `DisposableStack` | Resource cleanup |
| `formatBytes`, `truncateLine`, `truncateHead`, `truncateTail` | Text truncation helpers |
| `slugify` | String utility |
| `request`, `stream` | HTTP & SSE helpers |
| `parseJsonc`, `safeStringify` | JSON/JSONC helpers |
| `createTempLoggerPath` | Temp log path helper |

## Types

`Brand`, `DeepPartial`, `DeepReadonly`, `Awaitable`, `Disposable`, `AsyncDisposable`, `Events`, `HttpRequestOptions`, `HttpResponse`, `SseEvent`

## License

See [root README](../../README.md) for details.
