# @vitamin/config

JSONC configuration loader with Zod v4 schema validation, multi-level merging (project -> user -> defaults), automatic migration, and file watcher for live reloading.

## Installation

```bash
pnpm add @vitamin/config
```

## Usage

```typescript
import { loadConfig, createConfigWatcher, DEFAULT_CONFIG } from '@vitamin/config'

const result = await loadConfig({ projectDir: process.cwd() })
console.log(result.config)

const watcher = createConfigWatcher({ onUpdate: (cfg) => console.log('updated', cfg) })
```

## Key Exports

| Export | Description |
|--------|-------------|
| `loadConfig` | Load and validate config from project/user/defaults |
| `mergeConfigs`, `mergeConfigLayers` | Multi-level config merging |
| `parseConfigPartially` | JSONC parser with position tracking |
| `DEFAULT_CONFIG` | Built-in default configuration |
| `migrateConfig`, `registerMigration` | Config migration system |
| `createConfigWatcher`, `ConfigWatcher` | File watcher for live reload |
| `VitaminConfigSchema` | Zod v4 validation schema |

## Types

`VitaminConfig`, `AgentConfig`, `CategoryConfig`, `ConfigWarning`, `LoadConfigOptions`, `LoadConfigResult`, `Migration`, `ConfigWatcherOptions`

## License

See [root README](../../README.md) for details.
