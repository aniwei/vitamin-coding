# @vitamin/shared

## 模块定位
提供通用基础设施能力，如日志、事件、错误与工具函数。

## 当前状态（基于源码）
- 包目录：`packages/shared`
- 源码文件数：15
- 测试文件数：11
- 入口文件：`src/index.ts`

## 目录概览
- `src/`
  - `bus-subscrption.ts`
  - `disposable.ts`
  - `error.ts`
  - `event-emitter.ts`
  - `fs-extra.ts`
  - `http.ts`
  - `index.ts`
  - `jsonc.ts`
  - `logger.ts`
  - `markdown.ts`
  - `path.ts`
  - `string.ts`
- `tests/`
  - `disposable.test.ts`
  - `error.test.ts`
  - `event-emitter.test.ts`
  - `fs.test.ts`
  - `json.test.ts`
  - `logger.test.ts`
  - `markdown.test.ts`
  - `path.test.ts`
  - `string.test.ts`
  - `subscription.test.ts`
  - `truncate.test.ts`

## 公开导出
```ts
export { ConfigError, ProviderError, OAuthError, StreamError, AgentError, ToolError, HookError, SessionError, ExtensionError, McpError, } from './error'
export type { Brand, DeepPartial, DeepReadonly, Awaitable, VoidCallback, AsyncVoidCallback, } from './types'
export { TypedEventEmitter } from './event-emitter'
export type { Events } from './event-emitter'
export { createDisposable, createAsyncDisposable, DisposableStack, AsyncDisposableStack, } from './disposable'
export type { Disposable, AsyncDisposable } from './disposable'
export { createLogger, getRootLogger, attachLogListener, } from './logger'
export type { Logger } from './logger'
export { mkdirp, rimraf, exists, mime, isFile, isDirectory, } from './fs-extra'
export { formatBytes, truncateLine, truncateHead, truncateTail, } from './truncate'
export { normalizePath, createTempLoggerDir, createTempLoggerPath, getVitaminHomeDir, getVitaminProjectDir, getThirdPartyToolDir, getThirdPartyToolBinaryDir } from './path'
export { slugify } from './string'
export { parseJsonc, safeStringify } from './jsonc'
export { request, stream } from './http'
export type { HttpRequestOptions, HttpResponse, SseEvent } from './http'
export { Subscription } from './subscrption'
export { BusSubscription } from './bus-subscrption'
export { createMarkdownProcessor, createGfmProcessor, createFrontmatterProcessor, getNodeText, extractBoldLabels, extractInlineCodes, countChecks, extractFrontmatter, extractBodyFromAst, } from './markdown'
export type { MarkdownProcessor, MdastPosition, MdastNode, YamlNode, RootNode, } from './markdown'
```

## 开发命令
- `pnpm --filter @vitamin/shared build`
- `pnpm --filter @vitamin/shared typecheck:project`
- `pnpm --filter @vitamin/shared typecheck:file`
- `pnpm --filter @vitamin/shared typecheck`
- `pnpm --filter @vitamin/shared clean`

## 关联 Vitamin 包
- `@vitamin/env`
- `@vitamin/invariant`

## 维护说明
- 本文档已按当前源码结构同步更新。
- 同步日期：2026-04-07
