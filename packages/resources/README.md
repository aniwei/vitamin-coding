# @vitamin/resources

## 模块定位
提供资源管理器与设置/模板/记忆资源源适配。

## 当前状态（基于源码）
- 包目录：`packages/resources`
- 源码文件数：6
- 测试文件数：4
- 入口文件：`src/index.ts`

## 目录概览
- `src/`
  - `index.ts`
  - `memory-source.ts`
  - `prompt-template-source.ts`
  - `resource-manager.ts`
  - `settings-manager.ts`
  - `types.ts`
- `tests/`
  - `memory-source.test.ts`
  - `prompt-template-source.test.ts`
  - `resource-manager.test.ts`
  - `settings-manager.test.ts`

## 公开导出
```ts
export { SettingsManager, createSettingsManager } from './settings-manager'
export type { SettingsOptions, SettingsManagerOptions } from './settings-manager'
export { DefaultResourceManager, createResourceManager, createInMemoryResourceManager, } from './resource-manager'
export type { ResourceManager, ResourceManagerOptions, LoadedResources, ResourceDiagnostic, PromptTemplate, } from './resource-manager'
export type { MemoryInjectionSource, MemoryInjectionResult, PromptTemplateSource, PromptTemplateResult, } from './types'
export { PersistentMemorySource, InMemoryMemorySource } from './memory-source'
export type { PersistentMemorySourceOptions } from './memory-source'
export { FilesystemPromptTemplateSource, InMemoryPromptTemplateSource } from './prompt-template-source'
export type { FilesystemPromptTemplateSourceOptions } from './prompt-template-source'
```

## 开发命令
- `pnpm --filter @vitamin/resources build`
- `pnpm --filter @vitamin/resources typecheck:project`
- `pnpm --filter @vitamin/resources typecheck`
- `pnpm --filter @vitamin/resources clean`

## 关联 Vitamin 包
- `@vitamin/env`
- `@vitamin/memory`
- `@vitamin/setting`
- `@vitamin/shared`

## 维护说明
- 本文档已按当前源码结构同步更新。
- 同步日期：2026-04-07
