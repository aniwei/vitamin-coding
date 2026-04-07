# @vitamin/skill

## 模块定位
提供 Skill 注册、发现、匹配与解析能力。

## 当前状态（基于源码）
- 包目录：`packages/skill`
- 源码文件数：6
- 测试文件数：0
- 入口文件：`src/index.ts`

## 目录概览
- `src/`
  - `index.ts`
  - `skill-discovery.ts`
  - `skill-matcher.ts`
  - `skill-parser.ts`
  - `skill-registry.ts`
  - `types.ts`
- 当前包无 `tests/` 目录或目录为空。

## 公开导出
```ts
export { SkillRegistry, createSkillRegistry } from './skill-registry'
export type { SkillRegistryOptions } from './skill-registry'
export { parseSkillContent } from './skill-parser'
export { discoverSkills, getDefaultGlobalSkillDirs, resolveSourceType, } from './skill-discovery'
export { matchSkills } from './skill-matcher'
export type { SkillMetadata, SkillDefinition, SkillStatus, RegisteredSkill, SkillSourceType, SkillSource, SkillLibraryConfig, SkillMatch, SkillExecutionContext, SkillExecutionResult, SkillEvents, } from './types'
```

## 开发命令
- `pnpm --filter @vitamin/skill build`
- `pnpm --filter @vitamin/skill dev`
- `pnpm --filter @vitamin/skill typecheck`

## 关联 Vitamin 包
- `@vitamin/env`
- `@vitamin/shared`

## 维护说明
- 本文档已按当前源码结构同步更新。
- 同步日期：2026-04-07
