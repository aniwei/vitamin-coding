# @x-mars/setting 设计说明

## 设计目标

- 提供 X-Mars 配置的加载、合并、校验、迁移与监控能力。
- 支持多源配置（默认值 → 全局 → 项目 → 环境变量 → CLI 参数）的四层深度合并。
- 支持 JSONC 格式（带注释和尾随逗号的 JSON），提升配置文件可读性。
- 内置 Agent Profile 预设和模型定义，开箱即用。

## 非目标

- 不做运行时热更新推送（仅文件监控 + 重新加载）。
- 不实现业务逻辑。

## 实现原理

### 配置类型（types.ts）

`XMarsSetting` 定义完整配置结构：

```typescript
interface XMarsSetting {
  config_version?: string // 配置版本号（用于 migration）
  model?: {
    default: string // 默认使用的模型 ID
    slots?: WorkflowSlot // 覆盖各工作流插槽的模型
  }
  agents?: AgentConfig[] // Agent 配置文件列表
  permissions?: {
    mode: PermissionMode // 'auto' | 'plan' | 'dryrun' | 'full'
    policies?: PermissionPolicy[] // 自定义规则
  }
  tools?: {
    preset: ToolPreset // 'minimal' | 'standard' | 'full'
    disabled?: string[] // 黑名单工具 ID
    enabled?: string[] // 白名单工具 ID（追加到 preset）
  }
  mcp?: McpServerConfig[] // MCP 服务器配置
  memory?: Partial<MemoryConfig> // 记忆管理参数
  session?: Partial<SessionConfig> // 会话管理参数
}
```

所有字段均为可选，支持部分覆盖（深度合并而非替换）。

### 多层配置合并顺序

```
┌──────────────────────────────────────────┐
│  层级（优先级从低到高）                   │
├──────────────────────────────────────────┤
│ 1. 内置默认值（DEFAULT_SETTING）         │
│ 2. 全局配置 ~/.x-mars/setting.jsonc     │
│ 3. 项目配置 .x-mars/setting.jsonc       │
│ 4. 环境变量（X_MARS_MODEL 等）          │
│ 5. CLI 参数（--model, --preset 等）      │
└──────────────────────────────────────────┘
```

### deepMerge（deep-merge.ts）

`deepMerge(base, ...overrides)` 递归合并对象：

- **对象字段**：递归合并（子字段依次覆盖）
- **数组字段**：替换（后者完全覆盖前者，不做合并/去重）
- **原始值**：后者覆盖前者
- **undefined 字段**：跳过（不覆盖已有值）

### JSONC 解析

`SettingLoader` 使用 `@x-mars/shared` 的 `parseJsonc()` 解析配置文件：

- 移除 `// 单行注释` 和 `/* 多行注释 */`
- 移除尾随逗号（trailing commas）
- 解析为标准 JSON

### 配置加载器（setting-loader.ts）

`SettingLoader.load()` 执行流程：

```
1. 加载全局配置  ~/.x-mars/setting.jsonc
2. 加载项目配置  .x-mars/setting.jsonc（从 WORKSPACE_DIR 向上查找）
3. deepMerge(DEFAULT_SETTING, globalConfig, projectConfig)
4. 应用环境变量覆盖
5. 应用 CLI 参数覆盖（XMarsApp 启动时传入）
6. MigrationRunner.migrate(merged, config_version)
7. validate(merged) → 删除非法字段（不抛出错误）
8. 缓存并返回
```

**校验策略**：调用 `dropInvalidFields()` 而非抛出错误，非法字段被静默移除并记录 warn 日志，保证启动不因配置问题失败。

### 配置存储（stores/）

三种存储后端：

- `FileSettingStore`：从 `~/.x-mars/setting.jsonc` 或 `.x-mars/setting.jsonc` 加载 JSONC
- `RemoteSettingStore`：从 HTTP 远程端点 GET 加载（支持 Bearer Token）
- `InMemorySettingStore`：纯内存，用于测试

### 配置监控（setting-watcher.ts）

`SettingWatcher` 使用 `fs.watch()` 监控配置文件变化：

- 防抖处理（默认 300ms），避免频繁触发
- 文件变化 → 重新加载 → 发射 `setting:changed` 事件
- 支持 graceful stop（`dispose()`）

`XMarsApp` 在初始化后启动 `SettingWatcher`，配置变更时通知各子系统重新读取相关配置（如 hooks、tool preset）。

### 迁移系统（migration.ts）

`MigrationRunner` 管理版本迁移：

- 注册 `Migration`（fromVersion / toVersion / transform）
- 按 semver 排序，依次执行匹配版本的迁移
- 支持跨多版本链式迁移（如 1.0 → 1.1 → 2.0）
- 每次迁移后更新 `config_version` 字段

### 内置预设

#### Agent Profiles（presets/agents.ts）

8 个内置 Agent 配置（`BUILTIN_AGENT_PROFILES`）：

| ID          | 用途                                       |
| ----------- | ------------------------------------------ |
| `default`   | 标准编码 Agent（全工具 + normal 模型插槽） |
| `thinking`  | 深度思考 Agent（启用 extended thinking）   |
| `compact`   | 轻量 Agent（minimal 工具集，compact 模型） |
| `review`    | 代码审查专用（只读工具）                   |
| `plan`      | 规划 Agent（dryrun 权限模式）              |
| `vision`    | 视觉感知 Agent（vision 模型插槽）          |
| `critique`  | 批评/验证 Agent（critique 模型插槽）       |
| `sub-agent` | 子 Agent（被 orchestrator/swarm 调用）     |

#### 模型定义（presets/models.ts）

9 个 Copilot 模型定义（GPT-4o / Claude 系列 / Gemini / o 系列），包含 contextWindow / maxOutput / supportsThinking 等规格。

#### 任务映射（presets/task-profiles.ts）

`TASK_TYPE_PROFILE_MAP`：任务类型（coding/review/plan/...）到 Agent Profile ID 的映射，供 orchestrator 按任务类型选择 Agent Profile。

## 调用链路

### 配置加载与合并

```
XMarsApp.initialize()
       │
  SettingLoader.load(cliOverrides)
       │
  FileSettingStore.read('global')  → globalConfig（JSONC 解析）
  FileSettingStore.read('project') → projectConfig（JSONC 解析）
       │
  deepMerge(DEFAULT_SETTING, globalConfig, projectConfig)
       │
  applyEnvOverrides(merged) → 读取 X_MARS_MODEL 等环境变量
       │
  deepMerge(merged, cliOverrides)  ← CLI 参数最高优先级
       │
  MigrationRunner.migrate(config)
       │
  dropInvalidFields(config) → 静默移除非法字段
       │
  返回 XMarsSetting
       │
  SettingWatcher.start(settingPaths) → 监控文件变化
```

### 配置热更新

```
setting.jsonc 文件被修改
       │
  SettingWatcher（fs.watch 回调）
       │
  防抖 300ms
       │
  SettingLoader.reload()
       │
  重新执行完整加载流程
       │
  emit('setting:changed', newSetting)
       │
  XMarsApp 回调：更新 hooks / toolRegistry / permissionRegistry
```

## 模块分层

| 文件                                    | 职责                                                  |
| --------------------------------------- | ----------------------------------------------------- |
| `src/types.ts`                          | XMarsSetting / AgentProfile / PermissionConfig 等类型 |
| `src/setting-loader.ts`                 | 多层加载 + 深度合并 + 校验                            |
| `src/setting-watcher.ts`                | 文件监控 + 防抖                                       |
| `src/migration.ts`                      | 版本迁移系统                                          |
| `src/deep-merge.ts`                     | 递归深度合并                                          |
| `src/validate.ts`                       | 配置校验（dropInvalidFields）                         |
| `src/defaults.ts`                       | DEFAULT_SETTING 内置默认值                            |
| `src/stores/file-setting-store.ts`      | 文件存储（JSONC 解析）                                |
| `src/stores/remote-setting-store.ts`    | 远程 HTTP 存储                                        |
| `src/stores/in-memory-setting-store.ts` | 内存存储（测试）                                      |
| `src/presets/agents.ts`                 | 8 个内置 Agent Profile                                |
| `src/presets/models.ts`                 | 9 个 Copilot 模型定义                                 |
| `src/presets/task-profiles.ts`          | 任务类型到 Profile 的映射                             |
| `src/index.ts`                          | barrel 导出                                           |

## 入口与依赖

- **入口**：`src/index.ts`
- **内部依赖**：`@x-mars/shared`（parseJsonc / logger）、`@x-mars/env`、`@x-mars/invariant`
- **外部依赖**：`semver`（迁移版本比较）

## 测试策略

- 测试文件数：5
- 覆盖：deepMerge 边界（数组替换/对象递归）、多层配置合并优先级、迁移链执行、文件监控防抖、三种存储后端读写。

## 模块分层

| 文件                                    | 职责                                                  |
| --------------------------------------- | ----------------------------------------------------- |
| `src/types.ts`                          | XMarsSetting / AgentProfile / PermissionConfig 等类型 |
| `src/setting-loader.ts`                 | 多源加载 + 深度合并 + 校验                            |
| `src/setting-watcher.ts`                | 文件监控 + 防抖                                       |
| `src/migration.ts`                      | 版本迁移系统                                          |
| `src/deep-merge.ts`                     | 递归深度合并                                          |
| `src/stores/file-setting-store.ts`      | 文件存储                                              |
| `src/stores/remote-setting-store.ts`    | 远程存储                                              |
| `src/stores/in-memory-setting-store.ts` | 内存存储                                              |
| `src/presets/agents.ts`                 | 8 个内置 Agent Profile                                |
| `src/presets/models.ts`                 | 9 个 Copilot 模型                                     |
| `src/presets/task-profiles.ts`          | 任务映射                                              |
| `src/index.ts`                          | barrel 导出                                           |

## 入口与依赖

- **入口**：`src/index.ts`
- **内部依赖**：`@x-mars/shared`、`@x-mars/env`、`@x-mars/invariant`
- **外部依赖**：`semver`

## 测试策略

- 测试文件数：5
- 覆盖：配置加载合并、深度合并边界、迁移链、文件监控、存储后端
