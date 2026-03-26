# @vitamin/config

Zod v4 configuration schema, multi-layer merging, automatic migration, persistent storage (local/remote/memory), and file watcher for live reloading.

## Installation

```bash
pnpm add @vitamin/config
```

## Usage

```typescript
import {
  loadConfig,
  createConfigStore,
  createConfigWatcher,
  VITAMIN_DEFAULT_CONFIG,
} from '@vitamin/config'

// 1. 纯内存加载（无文件读取）
const config = await loadConfig()

// 2. 从本地文件加载
const store = createConfigStore({ type: 'local' })
const config = await loadConfig({
  store,
  configPaths: [
    '~/.config/vitamin/config.jsonc',
    './.vitamin/config.jsonc',
  ],
})

// 3. 从远程服务加载
const remoteStore = createConfigStore({
  type: 'remote',
  baseUrl: 'https://api.example.com',
  getAuth: async () => ({ token: await getToken() }),
})
const config = await loadConfig({
  store: remoteStore,
  configPaths: ['user-config'],
})

// 4. 文件监听
const watcher = createConfigWatcher({
  paths: ['./.vitamin/config.jsonc'],
  reload: async (path) => {
    const content = await store.read(path)
    return content ? JSON.parse(content) : {}
  },
})
watcher.on('change', (cfg, path) => console.log('updated', path))
```

## Key Exports

| Export | Description |
|--------|-------------|
| `loadConfig` | Load and validate config with multi-layer merging |
| `ConfigLoader` | Class-based loader with `load()` and `save()` |
| `createConfigStore` | Factory: create local/remote/memory store |
| `LocalConfigStore` | File-system JSONC config store |
| `RemoteConfigStore` | HTTP REST config store |
| `InMemoryConfigStore` | In-memory store (testing) |
| `VITAMIN_DEFAULT_CONFIG` | Built-in default configuration object |
| `migrate`, `registerMigration` | Config version migration system |
| `createConfigWatcher`, `ConfigWatcher` | File watcher for live reload |
| `VitaminConfigSchema` | Zod v4 validation schema |

## Types

`VitaminConfig`, `AgentConfig`, `CategoryConfig`, `ConfigWarning`, `LoadConfigOptions`, `ConfigStore`, `ConfigStoreOptions`, `StorageType`, `Migration`, `ConfigWatcherOptions`

## Merge Priority (low → high)

1. `VITAMIN_DEFAULT_CONFIG` (built-in defaults)
2. `extensionDefaults` (extension-provided)
3. File layers from `configPaths` (ordered low → high)
4. Environment variables (`VITAMIN_MODEL`, `VITAMIN_THEME`, `VITAMIN_LOG_LEVEL`)
5. `overrides` (CLI-level, highest priority)

`disabled_*` arrays are union-merged with deduplication; objects are deep-merged; other values are overwritten.

## License

See [root README](../../README.md) for details.
