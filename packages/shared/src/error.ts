// 所有 vitamin-coding 错误的基础类
// 每个错误必须携带 code，并可携带 cause、metadata 和 retryable 供跨包边界展示。
export type ErrorMetadata = Record<string, unknown>

export interface ErrorOptions {
  code: string
  cause?: globalThis.Error
  metadata?: ErrorMetadata
  retryable?: boolean
}

export interface SerializedError {
  name: string
  message: string
  code: string
  retryable?: boolean
  metadata?: ErrorMetadata
  cause?: {
    name: string
    message: string
  }
}

export class Error extends globalThis.Error {
  readonly code: string
  override readonly cause?: globalThis.Error
  readonly metadata?: ErrorMetadata
  readonly retryable?: boolean

  constructor(message: string, options: ErrorOptions) {
    super(message, { cause: options.cause })
    this.name = new.target.name
    this.code = options.code
    this.cause = options.cause
    this.metadata = options.metadata
    this.retryable = options.retryable
  }

  toJSON(): SerializedError {
    return serializeError(this)
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

export function isVitaminError(error: unknown): error is Error {
  return error instanceof Error
}

export function serializeError(error: unknown): SerializedError {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      code: error.code,
      retryable: error.retryable,
      metadata: error.metadata,
      cause: error.cause
        ? {
            name: error.cause.name,
            message: error.cause.message,
          }
        : undefined,
    }
  }

  if (error instanceof globalThis.Error) {
    return {
      name: error.name,
      message: error.message,
      code: 'UNKNOWN_ERROR',
    }
  }

  return {
    name: 'Error',
    message: String(error),
    code: 'UNKNOWN_ERROR',
  }
}
