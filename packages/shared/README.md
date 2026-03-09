# @vitamin/shared

Common utilities shared across all Vitamin packages: logger, filesystem helpers, path utils, typed event emitter, error hierarchy, and string/JSON tools.

## Installation

```bash
pnpm add @vitamin/shared
```

## Usage

```typescript
import { createLogger, readText, TypedEventEmitter, VitaminError } from '@vitamin/shared'

const log = createLogger('my-module')
log.info('started')

const content = await readText('/path/to/file.txt')
```

## Key Exports

| Export | Description |
|--------|-------------|
| `createLogger`, `getRootLogger` | Structured logger |
| `readText`, `writeText`, `mkdirp`, `rimraf`, `exists` | Filesystem helpers |
| `normalizePath`, `resolvePath`, `findProjectRoot` | Path utilities |
| `TypedEventEmitter` | Generic typed event emitter |
| `VitaminError`, `ConfigError`, `ProviderError`, ... | Error hierarchy (10 types) |
| `createDisposable`, `DisposableStack` | Resource cleanup |
| `spawnProcess` | Child process spawner |
| `truncate`, `slugify`, `estimateTokens` | String utilities |
| `parseJsonc`, `safeStringify` | JSON/JSONC helpers |

## Types

`Brand`, `DeepPartial`, `DeepReadonly`, `Awaitable`, `Disposable`, `AsyncDisposable`, `EventMap`, `SpawnOptions`, `SpawnResult`

## License

See [root README](../../README.md) for details.
