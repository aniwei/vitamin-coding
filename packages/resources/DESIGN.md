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

- `loadAll()` → **并行加载**所有 Source（Promise.allSettled），合并为 `LoadedResources`
- `getMemories()` → 返回已加载的记忆注入内容
- `getPromptTemplates()` → 返回提示模板列表
- `getDiagnostics()` → 返回碰撞检测诊断信息

**并行加载**设计：各 Source 之间无依赖，使用 `Promise.allSettled` 确保单个 Source 失败不影响其他 Source 加载，失败的 Source 将错误记录到 diagnostics。

**碰撞检测（collision-detection.ts）**：

`detectCollisions(templates)` 检测多个 Source 中同名资源冲突：

- 按 `name` 分组统计，重复则记录 `Diagnostic { severity: 'warning', message: '...' }`
- 不阻止加载，仅警告（由上层展示给用户）

**watch 模式**：

`DefaultResourceManager.watch()` 启动文件监控（仅文件系统 Source 支持），文件变更时重新加载对应 Source 并发射 `resources:updated` 事件，`VitaminApp` 订阅此事件触发相关子系统刷新。

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

| 文件                            | 职责                                            |
| ------------------------------- | ----------------------------------------------- |
| `src/types.ts`                  | ResourceManager / LoadedResources / Source 接口 |
| `src/resource-manager.ts`       | DefaultResourceManager 多源协调                 |
| `src/settings-manager.ts`       | 配置管理封装                                    |
| `src/memory-source.ts`          | PersistentMemorySource / InMemoryMemorySource   |
| `src/prompt-template-source.ts` | 文件/内存提示模板源                             |
| `src/collision-detection.ts`    | 资源名冲突检测                                  |
| `src/index.ts`                  | barrel 导出                                     |

## 入口与依赖

- **入口**：`src/index.ts`
- **内部依赖**：`@vitamin/setting`、`@vitamin/memory`、`@vitamin/prompt`、`@vitamin/shared`、`@vitamin/env`
- **外部依赖**：无

## 测试策略

- 测试文件数：4
- 覆盖：资源加载合并、冲突检测、Settings 事件转发、Source 接口
