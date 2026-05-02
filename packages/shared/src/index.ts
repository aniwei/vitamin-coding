export {
  Error as VitaminError,
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
  isVitaminError,
  serializeError,
} from './error'
export type { ErrorMetadata, ErrorOptions, SerializedError } from './error'

export type {
  Brand,
  DeepPartial,
  DeepReadonly,
  Awaitable,
  VoidCallback,
  AsyncVoidCallback,
} from './types'

export { TypedEventEmitter } from './event-emitter'
export type { Events } from './event-emitter'

export {
  createDisposable,
  createAsyncDisposable,
  DisposableStack,
  AsyncDisposableStack,
} from './disposable'
export type { Disposable, AsyncDisposable } from './disposable'

export {
  createLogger,
  getRootLogger,
  attachLogListener,
  registerPluginLogContribution,
  unregisterPluginLogContribution,
  listPluginLogContributions,
  getPluginLogSinkEntries,
  redactLogValue,
} from './logger'
export type {
  Logger,
  LogLevel,
  LoggerOptions,
  PluginLogSinkContribution,
  PluginLogFormatterContribution,
  PluginLogViewerContribution,
  PluginLogContribution,
  PluginLogSinkEntry,
} from './logger'

export { mkdirp, rimraf, exists, mime, isFile, isDirectory } from './fs-extra'

export { formatBytes, truncateLine, truncateHead, truncateTail } from './truncate'

export {
  normalizePath,
  createTempLoggerDir,
  createTempLoggerPath,
  getVitaminHomeDir,
  getVitaminProjectDir,
  getThirdPartyToolDir,
  getThirdPartyToolBinaryDir,
} from './path'

export { slugify } from './string'

export { parseJsonc, safeStringify } from './jsonc'

export { request, stream } from './http'
export type { HttpRequestOptions, HttpResponse, SseEvent } from './http'

export {
  RuntimeAbortError,
  RuntimeTimeoutError,
  sleep,
  withTimeout,
  limitConcurrency,
} from './runtime'
export type { SleepOptions, WithTimeoutOptions } from './runtime'

export {
  isRecord,
  asRecord,
  readString,
  readNumber,
  readBoolean,
  readObject,
  readArray,
  toCamelKey,
  normalizeKeysToCamel,
} from './browser/data'
export type { UnknownRecord } from './browser/data'

export { Subscription } from './subscrption'
export { BusSubscription } from './bus-subscrption'

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
export type { MarkdownProcessor, MdastPosition, MdastNode, YamlNode, RootNode } from './markdown'
