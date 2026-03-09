// Provider fallback 链引擎
// 支持同 Provider 重试 + 跨 Provider 降级
import { ProviderError, createLogger } from '@vitamin/shared'

import { createEventStream } from './event-stream'

import type { ApiKeyResolverOptions } from './api-key-resolver'
import type { ProviderRegistry } from './provider-registry'
import type { AssistantMessage, Model, StreamContext, StreamEvent, StreamOptions } from './types'
import type { EventStream } from './event-stream'

const log = createLogger('ai:fallback')

// Fallback 链配置
export interface FallbackChainConfig {
  // 最大重试次数（每个 Provider）
  maxRetries: number
  // 可重试错误类型
  retryableErrors: ('rate_limit' | 'overloaded' | 'server_error' | 'timeout')[]
  // 是否允许降级到其他 Provider
  crossProviderFallback: boolean
  // 退避策略
  backoff: { initial: number; multiplier: number; max: number }
}

// fallback 事件（扩展 StreamEvent）
export type FallbackEvent = StreamEvent | { type: 'fallback'; from: string; to: string }

// 默认 fallback 配置
export const DEFAULT_FALLBACK_CONFIG: FallbackChainConfig = {
  maxRetries: 3,
  retryableErrors: ['rate_limit', 'overloaded', 'server_error', 'timeout'],
  crossProviderFallback: true,
  backoff: { initial: 100, multiplier: 2, max: 10000 },
}

// 延迟函数类型（可注入替代，用于测试）
export type SleepFn = (ms: number) => Promise<void>

// 默认延迟实现
const defaultSleep: SleepFn = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// 带 fallback 的流式调用
export function streamWithFallback(
  models: Model[],
  context: StreamContext,
  config: FallbackChainConfig,
  providerRegistry: ProviderRegistry,
  apiKeyOptions?: ApiKeyResolverOptions,
  options?: StreamOptions,
  sleepFn: SleepFn = defaultSleep,
): EventStream<FallbackEvent, AssistantMessage> {
  const eventStream = createEventStream<FallbackEvent, AssistantMessage>()

  runFallbackLoop(
    models,
    context,
    config,
    providerRegistry,
    apiKeyOptions,
    options,
    eventStream,
    sleepFn,
  ).catch((error: unknown) => {
    eventStream.fail(error instanceof Error ? error : new Error(String(error)))
  })

  return eventStream
}

// fallback 循环
async function runFallbackLoop(
  models: Model[],
  context: StreamContext,
  config: FallbackChainConfig,
  providerRegistry: ProviderRegistry,
  apiKeyOptions: ApiKeyResolverOptions | undefined,
  options: StreamOptions | undefined,
  eventStream: EventStream<FallbackEvent, AssistantMessage>,
  sleepFn: SleepFn,
): Promise<void> {
  const { resolveApiKey } = await import('./api-key-resolver')

  for (let i = 0; i < models.length; i++) {
    const model = models[i]!
    let retries = 0

    while (retries < config.maxRetries) {
      try {
        const provider = providerRegistry.get(model.api)
        const apiKey = await resolveApiKey(model.provider, apiKeyOptions, options?.apiKey)

        const streamOptions: StreamOptions = {
          ...options,
          apiKey,
        }

        const signal = options?.signal ?? new AbortController().signal
        let finalMessage: AssistantMessage | undefined

        for await (const event of provider.stream(model, context, streamOptions, signal)) {
          eventStream.push(event)
          if (event.type === 'done') {
            finalMessage = event.message
          }
        }

        if (finalMessage) {
          eventStream.complete(finalMessage)
          return
        }

        // 流结束但没有 done 事件
        throw new ProviderError('Stream ended without done event', {
          code: 'PROVIDER_INCOMPLETE_STREAM',
        })
      } catch (error) {
        const errorCode = getErrorCode(error)
        log.warn({ model: model.id, retries, errorCode }, 'Provider 调用失败')

        // 上下文溢出不重试
        if (errorCode === 'context_overflow') {
          eventStream.fail(error instanceof Error ? error : new Error(String(error)))
          return
        }

        // 跨 Provider 降级
        if (
          (errorCode === 'rate_limit' || errorCode === 'overloaded') &&
          config.crossProviderFallback &&
          i < models.length - 1
        ) {
          const nextModel = models[i + 1]
          if (nextModel) {
            log.info({ from: model.id, to: nextModel.id }, '跨 Provider 降级')
            eventStream.push({
              type: 'fallback',
              from: model.id,
              to: nextModel.id,
            })
          }
          break // 切到下一个 model
        }

        // 可重试错误
        if (isRetryable(errorCode, config.retryableErrors)) {
          retries++
          const delay = Math.min(
            config.backoff.initial * config.backoff.multiplier ** (retries - 1),
            config.backoff.max,
          )
          log.debug({ delay, retries }, '等待重试')
          await sleepFn(delay)
          continue
        }

        // 不可重试错误
        eventStream.fail(error instanceof Error ? error : new Error(String(error)))
        return
      }
    }

    // 当前 model 用尽重试，继续下一个
    if (i < models.length - 1) {
      const nextModel = models[i + 1]
      if (nextModel) {
        eventStream.push({ type: 'fallback', from: model.id, to: nextModel.id })
      }
    }
  }

  eventStream.fail(
    new ProviderError('All providers exhausted', {
      code: 'PROVIDER_ALL_EXHAUSTED',
    }),
  )
}

// 从错误中提取错误码
function getErrorCode(error: unknown): string {
  if (error instanceof ProviderError) {
    if (error.code === 'PROVIDER_RATE_LIMIT') return 'rate_limit'
    if (error.code === 'PROVIDER_OVERLOADED') return 'overloaded'
    if (error.code === 'PROVIDER_SERVER_ERROR') return 'server_error'
    if (error.code === 'PROVIDER_TIMEOUT') return 'timeout'
    if (error.code === 'PROVIDER_CONTEXT_OVERFLOW') return 'context_overflow'
  }
  return 'unknown'
}

// 检查错误是否可重试
function isRetryable(code: string, retryable: string[]): boolean {
  return retryable.includes(code)
}


