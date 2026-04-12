# @vitamin/resources

## 模块定位

协调配置（settings）、记忆（memory）和提示模板（prompt）三大资源来源，提供统一的加载和冲突检测。

## 核心功能

| 模块                           | 功能                             |
| ------------------------------ | -------------------------------- |
| DefaultResourceManager         | 多源并行加载 → 合并 → 冲突检测   |
| SettingsManager                | @vitamin/setting 封装 + 事件通知 |
| PersistentMemorySource         | AGENTS.md 记忆注入               |
| FilesystemPromptTemplateSource | 提示模板文件扫描                 |
| CollisionDetection             | 同名资源冲突检测                 |

## LoadedResources

```ts
interface LoadedResources {
  memories: MemoryContext[]
  agentInstructions: string[]
  promptTemplates: PromptTemplate[]
  diagnostics: Diagnostic[]
}
```

## 目录概览

```
src/
  types.ts                    # 核心接口
  resource-manager.ts         # 多源协调
  settings-manager.ts         # 配置封装
  memory-source.ts            # 记忆源
  prompt-template-source.ts   # 模板源
  collision-detection.ts      # 冲突检测
  index.ts
tests/                        # 4 个测试文件
```

## 开发命令

```bash
pnpm --filter @vitamin/resources build
pnpm --filter @vitamin/resources typecheck
pnpm --filter @vitamin/resources clean
```

## 关联包

`@vitamin/setting`、`@vitamin/memory`、`@vitamin/prompt`、`@vitamin/shared`、`@vitamin/env`
