# @vitamin/setting 设计说明

## 设计目标

- 提供 Vitamin 配置的加载、合并、校验、迁移与监控能力。
- 支持多源配置（文件 / 远程 / 内存）和深度合并策略。
- 内置 Agent Profile 预设和模型定义。

## 非目标

- 不做运行时热更新推送（仅文件监控 + 重新加载）。
- 不实现业务逻辑。

## 实现原理

### 配置模式（types.ts）

`VitaminSetting` 定义完整配置结构：

- `model`：默认模型 + 插槽配置
- `agents`：Agent 配置文件列表
- `permissions`：权限模式 + 自定义规则
- `tools`：工具预设 + 启用/禁用列表
- `mcp`：MCP 服务器配置
- `memory`：记忆管理参数
- `session`：会话管理参数
- 所有字段均为可选，支持部分覆盖。

### 配置加载器（setting-loader.ts）

`SettingLoader` 实现多源加载和深度合并：

1. 从 `SettingStore` 加载基础配置
2. 从环境变量覆盖（`VITAMIN_MODEL` 等）
3. `deepMerge()` 递归合并（数组替换、对象递归）
4. 执行迁移（`migrate()`）
5. 校验最终配置
6. 缓存并返回 `VitaminSetting`

### 配置存储（stores/）

三种存储后端：

- `FileSettingStore`：从 `.vitamin/setting.json` 加载
- `RemoteSettingStore`：从 HTTP 远程加载
- `InMemorySettingStore`：纯内存（测试用）

### 配置监控（setting-watcher.ts）

`SettingWatcher` 使用 `fs.watch()` 监控配置文件变化：

- 防抖处理（默认 300ms）
- 文件变化 → 重新加载 → 发射 `setting:changed` 事件
- 支持 graceful stop

### 迁移系统（migration.ts）

`MigrationRunner` 管理版本迁移：

- 注册 `Migration`（fromVersion / toVersion / transform）
- 按 semver 排序依次执行
- 支持跨多版本链式迁移

### 内置预设

#### Agent Profiles（presets/agents.ts）

8 个内置 Agent 配置：

- `default` / `thinking` / `compact` / `review` / `plan` / `vision` / `critique` / `sub-agent`

#### 模型定义（presets/models.ts）

9 个 Copilot 模型定义（GPT-4o / Claude 系列 / Gemini / o-系列）。

#### 任务映射（presets/task-profiles.ts）

`TASK_TYPE_PROFILE_MAP`：任务类型到 Agent Profile 的映射。

## 实现流程

```
VitaminApp 初始化
       |
  SettingLoader.load()
       |
  SettingStore.read() --> 基础配置
       |
  环境变量覆盖
       |
  deepMerge(default, store, env)
       |
  MigrationRunner.migrate(config)
       |
  validate(config) --> VitaminSetting
       |
  返回完整配置

配置监控：
  SettingWatcher.start() --> fs.watch(settingPath)
       |
  文件变化 --> 防抖 --> SettingLoader.reload()
       |
  发射 setting:changed 事件
```

## 模块分层

| 文件                                    | 职责                                                    |
| --------------------------------------- | ------------------------------------------------------- |
| `src/types.ts`                          | VitaminSetting / AgentProfile / PermissionConfig 等类型 |
| `src/setting-loader.ts`                 | 多源加载 + 深度合并 + 校验                              |
| `src/setting-watcher.ts`                | 文件监控 + 防抖                                         |
| `src/migration.ts`                      | 版本迁移系统                                            |
| `src/deep-merge.ts`                     | 递归深度合并                                            |
| `src/stores/file-setting-store.ts`      | 文件存储                                                |
| `src/stores/remote-setting-store.ts`    | 远程存储                                                |
| `src/stores/in-memory-setting-store.ts` | 内存存储                                                |
| `src/presets/agents.ts`                 | 8 个内置 Agent Profile                                  |
| `src/presets/models.ts`                 | 9 个 Copilot 模型                                       |
| `src/presets/task-profiles.ts`          | 任务映射                                                |
| `src/index.ts`                          | barrel 导出                                             |

## 入口与依赖

- **入口**：`src/index.ts`
- **内部依赖**：`@vitamin/shared`、`@vitamin/env`、`@vitamin/invariant`
- **外部依赖**：`semver`

## 测试策略

- 测试文件数：5
- 覆盖：配置加载合并、深度合并边界、迁移链、文件监控、存储后端
