# @vitamin/resources

统一资源管理模块，负责加载和组装运行时所需的配置、记忆注入和 Prompt 模板。

## 安装

```bash
pnpm add @vitamin/resources
```

## 核心概念

- `ResourceManager`：统一入口，一次性加载 setting、memory 和 prompt template 三类资源
- `SettingsManager`：Setting 同步管理器，基于 `@vitamin/setting` 的 `loadSetting`
- `PersistentMemorySource` / `InMemoryMemorySource`：记忆注入数据源
- `FilesystemPromptTemplateSource` / `InMemoryPromptTemplateSource`：Prompt 模板数据源

## 快速接入

```ts
import { createResourceManager, createSettingsManager } from '@vitamin/resources'

const settings = createSettingsManager()
await settings.load()

const resources = createResourceManager({
  settingsManager: settings,
})

const loaded = await resources.load()
// loaded.setting — 合并后的 VitaminSetting
// loaded.memoryInjection — 格式化的记忆注入文本
// loaded.promptTemplates — Prompt 模板 Map
// loaded.diagnostics — 加载期间的警告信息
```

## 导出总览

### 管理器

| Export | Description |
|--------|-------------|
| `DefaultResourceManager` | 默认 ResourceManager 实现 |
| `createResourceManager` | 工厂函数 |
| `createInMemoryResourceManager` | 纯内存 ResourceManager（测试用） |
| `SettingsManager` | Setting 同步管理器 |
| `createSettingsManager` | SettingsManager 工厂 |

### 数据源

| Export | Description |
|--------|-------------|
| `PersistentMemorySource` | 基于文件系统的记忆数据源 |
| `InMemoryMemorySource` | 纯内存记忆数据源（测试用） |
| `FilesystemPromptTemplateSource` | 文件系统 Prompt 模板源 |
| `InMemoryPromptTemplateSource` | 纯内存 Prompt 模板源（测试用） |

### 类型

`ResourceManager`, `ResourceManagerOptions`, `LoadedResources`, `ResourceDiagnostic`, `PromptTemplate`, `MemoryInjectionSource`, `MemoryInjectionResult`, `PromptTemplateSource`, `PromptTemplateResult`, `SettingsOptions`, `SettingsManagerOptions`, `PersistentMemorySourceOptions`, `FilesystemPromptTemplateSourceOptions`
