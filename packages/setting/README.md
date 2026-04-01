# @vitamin/setting

Zod v4 configuration schema, multi-layer merging, automatic migration, persistent storage (local/remote/memory/file/http), and file watcher for live reloading.

## Installation

```bash
pnpm add @vitamin/setting
```

## Usage

```typescript
import {
  loadSetting,
  createSettingStore,
  createSettingWatcher,
  VITAMIN_DEFAULT_CONFIG,
} from '@vitamin/setting'

// 1. 纯内存加载（无文件读取）
const setting = await loadSetting()

// 2. 从本地文件加载（直接文件路径）
const settingStore = createSettingStore({ type: 'local' })
const setting = await loadSetting({
  store: settingStore,
  configPaths: [
    '~/.config/vitamin/config.jsonc',
    './.vitamin/config.jsonc',
  ],
})

// 3. 从远程服务加载（自定义 Config API）
const remoteStore = createSettingStore({
  type: 'remote',
  baseUrl: 'https://api.example.com',
  getAuth: async () => ({ token: await getToken() }),
})
const setting = await loadSetting({
  store: remoteStore,
  configPaths: ['user-config'],
})

// 4. 基于 @vitamin/persistence 的 file/http 后端
const persistentFileStore = createSettingStore({
  type: 'file',
  baseDir: './.vitamin/settings',
})

const persistentHttpStore = createSettingStore({
  type: 'http',
  baseUrl: 'https://api.example.com/settings',
  getAuth: async () => ({ token: await getToken() }),
  fetch,
})

// 5. 文件监听
const watcher = createSettingWatcher({
  paths: ['./.vitamin/config.jsonc'],
  reload: async (path: string) => {
    const content = await settingStore.read(path)
    return content ? JSON.parse(content) : {}
  },
})
watcher.on('change', (cfg, path) => console.log('updated', path))
```

## Key Exports

| Export | Description |
|--------|-------------|
| `loadSetting` | Load and validate setting with multi-layer merging |
| `SettingLoader` | Class-based loader with `load()` and `save()` |
| `createSettingStore` | Factory: create local/remote/memory/file/http store |
| `LocalSettingStore` | File-system JSONC setting store |
| `RemoteSettingStore` | HTTP REST setting store (path-based API) |
| `InMemorySettingStore` | In-memory store (testing) |
| `createFileSettingStore` | Persistence-backed file store |
| `createHttpSettingStore` | Persistence-backed HTTP store |
| `VITAMIN_DEFAULT_CONFIG` | Built-in default configuration object |
| `migrate`, `registerMigration` | Config version migration system |
| `createSettingWatcher`, `SettingWatcher` | File watcher for live reload |
| `VitaminSettingSchema` | Zod v4 validation schema |

Compatibility aliases are still exported: `loadConfig`, `ConfigLoader`, `createConfigStore`, `ConfigStore`, `createConfigWatcher`, `ConfigWatcher`.

## Types

`VitaminSetting`, `AgentConfig`, `CategoryConfig`, `SettingWarning`, `LoadSettingOptions`, `SettingStore`, `SettingStoreOptions`, `SettingStorageType`, `Migration`, `SettingWatcherOptions`

## Merge Priority (low → high)

1. `VITAMIN_DEFAULT_CONFIG` (built-in defaults)
2. `extensionDefaults` (extension-provided)
3. File layers from `configPaths` (ordered low → high)
4. Environment variables (`VITAMIN_MODEL`, `VITAMIN_THEME`, `VITAMIN_LOG_LEVEL`)
5. `overrides` (CLI-level, highest priority)

`disabled_*` arrays are union-merged with deduplication; objects are deep-merged; other values are overwritten.

## License

See [root README](../../README.md) for details.
