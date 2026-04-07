# @vitamin/resources 设计说明

## 设计目标

- 协调配置管理（settings）、记忆注入（memory）和提示模板（prompt）三大资源来源。
- 提供统一的 ResourceManager 接口，封装多源资源加载和冲突检测。
- 支持可扩展的 Source 抽象。

## 非目标

- 不实现具体的配置/记忆/提示逻辑（由对应子包完成）。
- 不做运行时缓存（由各 Source 自行管理）。

## 实现原理

### SettingsManager（settings-manager.ts）

封装 `@vitamin/setting` 的 SettingLoader，增加事件通知：
- `load()` → 加载配置
- `get(key)` → 读取配置项
- `onChanged(callback)` → 配置变化通知
- 将 SettingWatcher 事件转换为本地事件

### DefaultResourceManager（resource-manager.ts）

组合多个 Source 提供统一加载接口：
- `loadAll()` → 并行加载所有 Source → 合并为 `LoadedResources`
- `getMemories()` → 记忆注入内容
- `getPromptTemplates()` → 提示模板列表
- `getDiagnostics()` → 加载诊断信息

### 记忆注入源

- `PersistentMemorySource`：基于 `@vitamin/memory` PersistentMemory 加载 AGENTS.md
- `InMemoryMemorySource`：纯内存（测试用）

### 提示模板源

- `FilesystemPromptTemplateSource`：从文件系统扫描 `.vitamin/prompts/`
- `InMemoryPromptTemplateSource`：纯内存（测试用）

### LoadedResources（types.ts）

```ts
interface LoadedResources {
  memories: MemoryContext[]
  agentInstructions: string[]
  promptTemplates: PromptTemplate[]
  diagnostics: Diagnostic[]
}
```

### 冲突检测（collision-detection.ts）

检测多个 Source 加载同名资源的情况：
- `detectCollisions(templates)` → 按名称分组，报告重复
- 记录到 diagnostics 供上层展示

## 实现流程

```
VitaminApp.init()
       |
  createResourceManager(config)
       |
  DefaultResourceManager
    ├── PersistentMemorySource (AGENTS.md)
    ├── FilesystemPromptTemplateSource (prompts/)
    └── SettingsManager (setting)
       |
  resourceManager.loadAll()
       |
  并行加载 → 合并结果
       |
  冲突检测 → diagnostics
       |
  返回 LoadedResources
```

## 模块分层

| 文件 | 职责 |
|------|------|
| `src/types.ts` | ResourceManager / LoadedResources / Source 接口 |
| `src/resource-manager.ts` | DefaultResourceManager 多源协调 |
| `src/settings-manager.ts` | 配置管理封装 |
| `src/memory-source.ts` | PersistentMemorySource / InMemoryMemorySource |
| `src/prompt-template-source.ts` | 文件/内存提示模板源 |
| `src/collision-detection.ts` | 资源名冲突检测 |
| `src/index.ts` | barrel 导出 |

## 入口与依赖

- **入口**：`src/index.ts`
- **内部依赖**：`@vitamin/setting`、`@vitamin/memory`、`@vitamin/prompt`、`@vitamin/shared`、`@vitamin/env`
- **外部依赖**：无

## 测试策略

- 测试文件数：4
- 覆盖：资源加载合并、冲突检测、Settings 事件转发、Source 接口
