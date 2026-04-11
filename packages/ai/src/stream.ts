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

async function start<T extends Api>(
  model: Model<T>,
  provider: ProviderStream,
  context: StreamContext,
  options: StreamOptions,
  stream: EventStream<StreamEvent, AssistantMessage>,
): Promise<void> {
  const { signal } = options

  const controller = new AbortController()
  stream.setAbortController(controller)

  const combinedSignal = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal

  const streamOptions: StreamOptions = {
    ...options,
    signal: combinedSignal,
  }

  let lastMessage: AssistantMessage | undefined

  try {
    for await (const event of provider.converse(model, context, streamOptions, combinedSignal)) {
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

    if (lastMessage) {
      stream.complete(lastMessage)
    } else {
      stream.fail(
        new ProviderError('Stream ended without done event', {
          code: 'PROVIDER_INCOMPLETE_STREAM',
        }),
      )
    }
  } catch (error) {
    if (error instanceof Error) {
      stream.fail(error)
    } else {
      stream.fail(
        new ProviderError('Stream failed', {
          code: 'PROVIDER_STREAM_ERROR',
          cause: new Error(String(error)),
        }),
      )
    }
  }
}

export function stream(
  model: Model,
  provider: ProviderStream,
  context: StreamContext,
  options: StreamOptions,
): EventStream<StreamEvent, AssistantMessage> {
  const stream = createEventStream<StreamEvent, AssistantMessage>()

  start(model, provider, context, options, stream).catch((error: unknown) => {
    const err = error instanceof Error ? error : new Error(String(error))
    stream.fail(err)
  })

  return stream
}

export async function complete(
  model: Model,
  provider: ProviderStream,
  context: StreamContext,
  options: StreamOptions,
): Promise<AssistantMessage> {
  const s = stream(model, provider, context, options)
  return s.result()
}

export function simple(
  model: Model,
  provider: ProviderStream,
  context: Omit<StreamContext, 'thinkingLevel'> & { thinkingLevel?: ThinkingLevel },
  options: StreamOptions,
): EventStream<StreamEvent, AssistantMessage> {
  return stream(model, provider, context as StreamContext, options)
}
