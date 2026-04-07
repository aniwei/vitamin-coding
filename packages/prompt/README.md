# @vitamin/prompt

## 模块定位
提供系统提示词装配、模板提供器与环境上下文拼接。

## 当前状态（基于源码）
- 包目录：`packages/prompt`
- 源码文件数：12
- 测试文件数：2
- 入口文件：`src/index.ts`

## 目录概览
- `src/`
  - `constants.ts`
  - `environment-context.ts`
  - `http-provider.ts`
  - `index.ts`
  - `lesson-injection.ts`
  - `local-provider.ts`
  - `phase-context.ts`
  - `prompt-cache.ts`
  - `prompt-factory.ts`
  - `prompt-manager.ts`
  - `sub-agent-prompt.ts`
  - `types.ts`
- `tests/`
  - `lesson-injection.test.ts`
  - `prompt.test.ts`

## 公开导出
```ts
export { LocalPromptProvider } from './local-provider'
export { HttpPromptProvider } from './http-provider'
export { createPromptProvider } from './prompt-factory'
export { PromptManager } from './prompt-manager'
export type { PromptManagerOptions, PromptPreset, PromptPresetOptions } from './prompt-manager'
export { PromptCache } from './prompt-cache'
export { BUILTIN_PROMPTS_DIR } from './constants'
export { injectPhaseContext, extractPhaseFromMessage } from './phase-context'
export { buildLessonInjection } from './lesson-injection'
export { assembleGenericSubAgentPrompt, assembleSubAgentPrompt, resolveAgentProfile, resolveAgentToolNames, } from './sub-agent-prompt'
export type { AgentProfile, SubAgentPromptContext } from './sub-agent-prompt'
export { collectEnvironment, formatEnvironmentBlock } from './environment-context'
export type { Environment } from './environment-context'
export type { PromptEntry, PromptProvider, PromptProviderOptions, LocalProviderOptions, RemoteProviderOptions, PhaseAnnotation, Lesson, } from './types'
```

## 开发命令
- `pnpm --filter @vitamin/prompt build`
- `pnpm --filter @vitamin/prompt typecheck:project`
- `pnpm --filter @vitamin/prompt typecheck:file`
- `pnpm --filter @vitamin/prompt typecheck`
- `pnpm --filter @vitamin/prompt clean`

## 关联 Vitamin 包
- `@vitamin/shared`

## 维护说明
- 本文档已按当前源码结构同步更新。
- 同步日期：2026-04-07
