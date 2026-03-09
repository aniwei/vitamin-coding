// 所有 vitamin-coding 错误的基础类
// 每个错误必须携带 code 和可选的 cause
export class Error extends globalThis.Error {
  readonly code: string
  override readonly cause?: globalThis.Error

  constructor(message: string, options: { code: string; cause?: globalThis.Error }) {
    super(message, { cause: options.cause })
    this.name = new.target.name
    this.code = options.code
    this.cause = options.cause
  }
}

export class ConfigError extends Error {}
export class NetworkError extends Error {}
export class ProviderError extends Error {}
export class OAuthError extends Error {}
export class StreamError extends Error {}
export class AgentError extends Error {}
export class ToolError extends Error {}
export class HookError extends Error {}
export class SessionError extends Error {}
export class ExtensionError extends Error {}
export class McpError extends Error {}
