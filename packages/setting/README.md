# @x-mars/setting

## 模块定位

提供 X-Mars 配置的加载、合并、校验、迁移与监控能力，支持文件/远程/内存三种配置源。

## 核心功能

| 模块                 | 功能                            |
| -------------------- | ------------------------------- |
| SettingLoader        | 多源加载 + 深度合并 + 校验      |
| SettingWatcher       | fs.watch 文件变化监控 + 防抖    |
| MigrationRunner      | 版本迁移系统（semver 链式迁移） |
| FileSettingStore     | 文件配置存储                    |
| RemoteSettingStore   | HTTP 远程配置                   |
| InMemorySettingStore | 内存配置（测试用）              |
| Agent Profiles       | 8 个内置 Agent 配置预设         |
| Copilot Models       | 9 个模型定义                    |

## 目录概览

```
src/
  types.ts              # 核心类型
  setting-loader.ts     # 配置加载器
  setting-watcher.ts    # 配置监控
  migration.ts          # 迁移系统
  deep-merge.ts         # 深度合并
  stores/               # 3 种存储后端
  presets/              # 内置预设
  index.ts
tests/                  # 5 个测试文件
```

## 开发命令

```bash
pnpm --filter @x-mars/setting build
pnpm --filter @x-mars/setting typecheck
pnpm --filter @x-mars/setting clean
```

## 关联包

`@x-mars/shared`、`@x-mars/env`、`@x-mars/invariant`
