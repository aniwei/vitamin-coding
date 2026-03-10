// 流式编排入口 — stream() / complete() / streamSimple()
import { ProviderError } from '@vitamin/shared'
import { type EventStream, createEventStream } from './event-stream'

import type {
  Api,
  AssistantMessage,
  Model,
  ProviderStream,
  StreamContext,
  StreamEvent,
  StreamOptions,
  ThinkingLevel,
} from './types'

// 内部: 启动流式调用
async function start<T extends Api>(
  model: Model<T>,
  provider: ProviderStream,
  context: StreamContext,
  options: StreamOptions,
  stream: EventStream<StreamEvent, AssistantMessage>
): Promise<void> {
  const { signal } = options

  // 创建 abort 控制器
  const controller = new AbortController()
  stream.setAbortController(controller)

  // 合并外部 signal
  const combinedSignal = signal 
    ? AbortSignal.any([signal, controller.signal]) 
    : controller.signal
  const streamOptions: StreamOptions = {
    ...options,
    signal: combinedSignal,
  }

  let lastMessage: AssistantMessage | undefined

  try {
    // 遍历 Provider 返回的事件
    for await (const event of provider.converse(
      model, 
      context, 
      streamOptions, 
      combinedSignal)
    ) {
      stream.push(event)

      switch (event.type) {
        case 'done':
          lastMessage = event.message
          break
        case 'error':
          stream.fail(event.error)
          return
      }
    }

    // 流完成
    if (lastMessage) {
      stream.complete(lastMessage)
    } else {
      stream.fail(new ProviderError('Stream ended without done event', {
        code: 'PROVIDER_INCOMPLETE_STREAM',
      }))
    }
  } catch (error) {
    if (error instanceof Error) {
      stream.fail(error)
    } else {
      stream.fail(new ProviderError('Stream failed', {
        code: 'PROVIDER_STREAM_ERROR',
        cause: new Error(String(error)),
      }))
    }
  }
}


// 底层流式 API — 返回 EventStream
export function stream(
  model: Model,
  provider: ProviderStream,
  context: StreamContext,
  options: StreamOptions
): EventStream<StreamEvent, AssistantMessage> {
  const stream = createEventStream<StreamEvent, AssistantMessage>()

  // 异步启动流
  start(model, provider, context, options, stream).catch((error: unknown) => {
    const err = error instanceof Error ? error : new Error(String(error))
    stream.fail(err)
  })

  return stream
}

// 一次性完成 — await 直接拿到结果
export async function complete(
  model: Model,
  provider: ProviderStream,
  context: StreamContext,
  options: StreamOptions,
): Promise<AssistantMessage> {
  const s = stream(model, provider, context, options)
  return s.result()
}

// 简化版流式 — 额外接受 thinkingLevel 参数
export function simple(
  model: Model,
  provider: ProviderStream,
  context: Omit<StreamContext, 'thinkingLevel'> & { thinkingLevel?: ThinkingLevel },
  options: StreamOptions
): EventStream<StreamEvent, AssistantMessage> {
  return stream(model, provider, context as StreamContext, options)
}

