# @vitamin/shared

## 模块定位

提供跨包共享的通用基础设施能力：日志、事件系统、错误体系、文件系统、HTTP 客户端、序列化、Markdown 处理等。

## 核心功能

| 模块         | 功能                                                                                                    |
| ------------ | ------------------------------------------------------------------------------------------------------- |
| 错误体系     | 10 个分域错误类（Config / Provider / OAuth / Stream / Agent / Tool / Hook / Session / Extension / Mcp） |
| 事件系统     | TypedEventEmitter、Subscription（通配符）、BusSubscription（总线）                                      |
| 资源生命周期 | DisposableStack / AsyncDisposableStack（LIFO 自动回收）                                                 |
| 日志         | 基于 pino 的结构化日志，支持多目标输出和全局监听                                                        |
| 文件系统     | mkdirp / rimraf / exists / isFile / isDirectory / mime                                                  |
| 路径         | 跨平台规范化 + Vitamin 约定目录解析                                                                     |
| HTTP         | request()（Fetch API）/ stream()（SSE 流式读取）                                                        |
| JSONC        | 支持注释和尾逗号的 JSON 解析 + 稳定序列化                                                               |
| Markdown     | unified/remark AST 解析 + 提取工具                                                                      |
| 截断         | 按行/字节截断文本 + 格式化工具                                                                          |

## 目录概览

```
src/
  error.ts              # 分域错误类
  types.ts              # 类型工具
  event-emitter.ts      # TypedEventEmitter
  subscrption.ts        # Subscription
  bus-subscrption.ts    # BusSubscription
  disposable.ts         # 可释放资源栈
  logger.ts             # pino 日志
  fs-extra.ts           # 文件系统工具
  path.ts               # 路径工具
  string.ts             # 字符串工具
  jsonc.ts              # JSONC 解析
  http.ts               # HTTP + SSE
  markdown.ts           # Markdown AST
  truncate.ts           # 文本截断
  index.ts              # barrel 导出
tests/                  # 11 个测试文件
```

## 公开导出

```ts
// 错误类
export {
  ConfigError,
  ProviderError,
  OAuthError,
  StreamError,
  AgentError,
  ToolError,
  HookError,
  SessionError,
  ExtensionError,
  McpError,
} from './error'
// 类型工具
export type {
  Brand,
  DeepPartial,
  DeepReadonly,
  Awaitable,
  VoidCallback,
  AsyncVoidCallback,
} from './types'
// 事件
export { TypedEventEmitter } from './event-emitter'
export { Subscription } from './subscrption'
export { BusSubscription } from './bus-subscrption'
// 资源管理
export {
  createDisposable,
  createAsyncDisposable,
  DisposableStack,
  AsyncDisposableStack,
} from './disposable'
// 日志
export { createLogger, getRootLogger, attachLogListener } from './logger'
// 文件系统
export { mkdirp, rimraf, exists, mime, isFile, isDirectory } from './fs-extra'
// 截断
export { formatBytes, truncateLine, truncateHead, truncateTail } from './truncate'
// 路径
export {
  normalizePath,
  getVitaminHomeDir,
  getVitaminProjectDir,
  getThirdPartyToolDir,
  getThirdPartyToolBinaryDir,
} from './path'
// 字符串
export { slugify } from './string'
// JSON
export { parseJsonc, safeStringify } from './jsonc'
// HTTP
export { request, stream } from './http'
// Markdown
export {
  createMarkdownProcessor,
  createGfmProcessor,
  createFrontmatterProcessor,
  getNodeText,
  extractBoldLabels,
  extractInlineCodes,
  countChecks,
  extractFrontmatter,
  extractBodyFromAst,
} from './markdown'
```

## 开发命令

```bash
pnpm --filter @vitamin/shared build
pnpm --filter @vitamin/shared typecheck
pnpm --filter @vitamin/shared clean
```

## 关联包

`@vitamin/env`、`@vitamin/invariant`
