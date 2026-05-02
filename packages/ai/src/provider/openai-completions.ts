import { stream, createLogger, ProviderError } from '@vitamin/shared'

import type {
  AssistantMessage,
  Message,
  Model,
  StopReason,
  StreamContext,
  StreamEvent,
  StreamOptions,
  TextContent,
  ThinkingContent,
  ToolCall,
} from '../types'
import type { ProviderStream } from '../types'

const logger = createLogger('@vitamin/ai:openai-completions')

export type OpenAICompatibleCredentialResolver = (model: Model) => Promise<string | undefined>

export type OpenAICompatibleBaseUrlResolver = (model: Model) => Promise<string | undefined>

function sanitizeSurrogates(text: string): string {
  return text.replace(
    /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g,
    '\uFFFD',
  )
}

function hasToolHistory(messages: Message[]): boolean {
  for (const msg of messages) {
    if (msg.role === 'tool_result') {
      return true
    }
    if (msg.role === 'assistant' && msg.content.some((block) => block.type === 'tool_call')) {
      return true
    }
  }
  return false
}

function buildAssistantTextContent(
  message: Extract<Message, { role: 'assistant' }>,
): string | null {
  const text = message.content
    .filter((part): part is TextContent => part.type === 'text')
    .filter((part) => part.text.trim().length > 0)
    .map((part) => sanitizeSurrogates(part.text))
    .join('')

  return text || null
}

function buildAssistantReasoningContent(
  model: Model,
  message: Extract<Message, { role: 'assistant' }>,
): string | undefined {
  if (!(model.provider === 'deepseek' && model.reasoning)) {
    return undefined
  }

  return message.content
    .filter((part): part is ThinkingContent => part.type === 'thinking')
    .map((part) => sanitizeSurrogates(part.text))
    .join('')
}

function buildOpenAIMessages(model: Model, context: StreamContext): unknown[] {
  const result: unknown[] = []

  if (context.systemPrompt) {
    result.push({ role: 'system', content: sanitizeSurrogates(context.systemPrompt) })
  }

  for (const msg of context.messages) {
    if (msg.role === 'user') {
      if (typeof msg.content === 'string') {
        result.push({ role: 'user', content: sanitizeSurrogates(msg.content) })
      } else {
        result.push({
          role: 'user',
          content: msg.content.map((part) => {
            if (part.type === 'text') {
              return { type: 'text', text: sanitizeSurrogates(part.text) }
            }
            if (part.type === 'image') {
              return {
                type: 'image_url',
                image_url: {
                  url: `data:${part.mime};base64,${part.source}`,
                },
              }
            }
            return { type: 'text', text: '[unsupported]' }
          }),
        })
      }
      continue
    }

    if (msg.role === 'assistant') {
      const toolCalls = msg.content
        .filter((part): part is ToolCall => part.type === 'tool_call')
        .map((toolCall) => ({
          id: toolCall.id,
          type: 'function',
          function: {
            name: toolCall.name,
            arguments: JSON.stringify(toolCall.arguments),
          },
        }))

      const content = buildAssistantTextContent(msg)
      const reasoningContent = buildAssistantReasoningContent(model, msg)

      if (!content && toolCalls.length === 0 && !reasoningContent) {
        continue
      }

      result.push({
        role: 'assistant',
        content,
        ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
        ...(reasoningContent !== undefined ? { reasoning_content: reasoningContent } : {}),
      })
      continue
    }

    result.push({
      role: 'tool',
      tool_call_id: msg.toolCallId,
      content: sanitizeSurrogates(
        msg.content.map((part) => (part.type === 'text' ? part.text : '')).join(''),
      ),
    })
  }

  return result
}

function toReasoningEffort(level: string): string {
  switch (level) {
    case 'minimal':
    case 'low':
      return 'low'
    case 'high':
    case 'xhigh':
      return 'high'
    default:
      return 'medium'
  }
}

function toDeepSeekReasoningEffort(level: string): string {
  switch (level) {
    case 'xhigh':
      return 'max'
    default:
      return 'high'
  }
}

function toJsonSchema(schema: { toJSONSchema?: () => unknown }): unknown {
  return schema.toJSONSchema?.() ?? {}
}

function buildRequestBody(model: Model, context: StreamContext): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: model.name,
    messages: buildOpenAIMessages(model, context),
    max_tokens: context.maxTokens ?? model.maxOutputTokens,
    stream: true,
    stream_options: { include_usage: true },
  }

  if (context.temperature !== undefined && !model.reasoning) {
    body.temperature = context.temperature
  }

  if (model.reasoning) {
    if (model.provider === 'deepseek') {
      body.thinking = { type: context.thinkingLevel ? 'enabled' : 'disabled' }
      if (context.thinkingLevel) {
        body.reasoning_effort = toDeepSeekReasoningEffort(context.thinkingLevel)
      }
    } else if (context.thinkingLevel) {
      body.reasoning_effort = toReasoningEffort(context.thinkingLevel)
    }
  }

  if (context.tools && context.tools.length > 0) {
    body.tools = context.tools.map((tool) => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: toJsonSchema(tool.parameters),
      },
    }))
  } else if (hasToolHistory(context.messages)) {
    body.tools = []
  }

  return body
}

interface OpenAICompatibleStreamState {
  api: string
  provider: string
  model: string
  textContent: string
  thinkingText: string
  toolCalls: Map<number, { id: string; name: string; argumentsJson: string }>
  inputTokens: number
  outputTokens: number
  stopReason: StopReason
}

function initStreamState(model: Model): OpenAICompatibleStreamState {
  return {
    api: model.api,
    provider: model.provider,
    model: model.id,
    textContent: '',
    thinkingText: '',
    toolCalls: new Map(),
    inputTokens: 0,
    outputTokens: 0,
    stopReason: 'end_turn',
  }
}

function buildAssistantMessage(state: OpenAICompatibleStreamState): AssistantMessage {
  const content: (TextContent | ThinkingContent | ToolCall)[] = []

  if (state.thinkingText) {
    content.push({ type: 'thinking', text: state.thinkingText })
  }

  if (state.textContent) {
    content.push({ type: 'text', text: state.textContent })
  }

  for (const [, toolCall] of state.toolCalls) {
    let args: Record<string, unknown> = {}
    try {
      args = JSON.parse(toolCall.argumentsJson) as Record<string, unknown>
    } catch {
      // 工具参数在流式传输中逐步到达，可能收到不完整的 JSON
    }

    content.push({
      type: 'tool_call',
      id: toolCall.id,
      name: toolCall.name,
      arguments: args,
    })
  }

  return {
    role: 'assistant',
    content,
    api: state.api,
    provider: state.provider,
    model: state.model,
    usage: {
      inputTokens: state.inputTokens,
      outputTokens: state.outputTokens,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    },
    stopReason: state.stopReason,
  }
}

export interface OpenAICompatibleProviderOptions {
  resolveKey?: OpenAICompatibleCredentialResolver
  resolveBaseUrl?: OpenAICompatibleBaseUrlResolver
}

class OpenAICompatibleStream implements ProviderStream {
  readonly id = 'openai-completions'
  readonly displayName = 'OpenAI Compatible'

  constructor(
    private readonly resolveCredential?: OpenAICompatibleCredentialResolver,
    private readonly baseUrlResolver?: OpenAICompatibleBaseUrlResolver,
  ) {}

  async resolveKey(model: Model): Promise<string> {
    if (this.resolveCredential) {
      const key = await this.resolveCredential(model)
      if (key) {
        return key
      }
    }

    throw new ProviderError(`Missing ${model.provider} API key.`, {
      code: 'PROVIDER_AUTH_MISSING',
    })
  }

  async *converse(
    model: Model,
    context: StreamContext,
    options: StreamOptions,
    signal: AbortSignal,
  ): AsyncIterable<StreamEvent> {
    const key = await this.resolveKey(model)
    const resolvedBaseUrl = (await this.baseUrlResolver?.(model)) ?? model.baseUrl
    const url = `${resolvedBaseUrl.replace(/\/+$/, '')}/chat/completions`
    const body = buildRequestBody(model, context)

    logger.debug(
      { model: model.id, provider: model.provider },
      'Starting OpenAI-compatible stream with body: %o',
      body,
    )

    const state = initStreamState(model)
    let started = false

    const sse = stream({
      url,
      body,
      headers: {
        authorization: `Bearer ${key}`,
      },
      signal,
      timeout: options.timeout ?? 300000,
    })

    for await (const event of sse) {
      if (event.data === '[DONE]') {
        break
      }

      try {
        const data = JSON.parse(event.data) as Record<string, unknown>

        if (data.usage) {
          const usage = data.usage as Record<string, unknown>
          const promptTokens = (usage.prompt_tokens as number) ?? 0
          const completionTokens = (usage.completion_tokens as number) ?? 0
          const promptDetails = usage.prompt_tokens_details as Record<string, number> | undefined
          const completionDetails = usage.completion_tokens_details as
            | Record<string, number>
            | undefined
          const cachedTokens = promptDetails?.cached_tokens ?? 0
          const reasoningTokens = completionDetails?.reasoning_tokens ?? 0

          state.inputTokens = promptTokens - cachedTokens
          state.outputTokens = completionTokens + reasoningTokens
        }

        const choices = data.choices as Array<Record<string, unknown>> | undefined
        if (!choices?.length) {
          continue
        }

        const choice = choices[0]
        if (!choice) {
          continue
        }
        const delta = choice.delta as Record<string, unknown> | undefined
        if (!delta) {
          continue
        }

        if (!started) {
          started = true
          yield { type: 'start', partial: buildAssistantMessage(state) }
        }

        if (choice.finish_reason) {
          const reason = choice.finish_reason as string
          if (reason === 'stop') {
            state.stopReason = 'end_turn'
          } else if (reason === 'length') {
            state.stopReason = 'max_tokens'
          } else if (reason === 'tool_calls') {
            state.stopReason = 'tool_use'
          } else {
            state.stopReason = 'end_turn'
            logger.warn(`Unknown finish_reason: ${reason}`)
          }
        }

        if (delta.content) {
          const text = delta.content as string
          state.textContent += text
          yield { type: 'text_delta', index: 0, delta: text, partial: buildAssistantMessage(state) }
        }

        const reasoningText =
          (delta.reasoning_content as string) ??
          (delta.reasoning as string) ??
          (delta.reasoning_text as string) ??
          null
        if (reasoningText) {
          state.thinkingText += reasoningText
          yield {
            type: 'thinking_delta',
            index: 0,
            delta: reasoningText,
            partial: buildAssistantMessage(state),
          }
        }

        if (delta.tool_calls) {
          const toolCallDeltas = delta.tool_calls as Array<Record<string, unknown>>
          for (const toolCallDelta of toolCallDeltas) {
            const idx = toolCallDelta.index as number
            const fn = toolCallDelta.function as Record<string, unknown> | undefined

            if (!state.toolCalls.has(idx)) {
              const id = (toolCallDelta.id as string) ?? `call_${idx}`
              const name = (fn?.name as string) ?? ''
              state.toolCalls.set(idx, { id, name, argumentsJson: '' })
              yield {
                type: 'tool_call_start',
                index: idx,
                partial: buildAssistantMessage(state),
              }
            }

            const toolCall = state.toolCalls.get(idx)
            if (!toolCall) {
              continue
            }
            if (fn?.arguments) {
              const argDelta = fn.arguments as string
              toolCall.argumentsJson += argDelta
              yield {
                type: 'tool_call_delta',
                index: idx,
                delta: argDelta,
                partial: buildAssistantMessage(state),
              }
            }
          }
        }
      } catch (error) {
        logger.warn({ error }, 'Failed to parse OpenAI-compatible SSE event')
      }
    }

    for (const [idx, toolCall] of state.toolCalls) {
      let args: Record<string, unknown> = {}
      try {
        args = JSON.parse(toolCall.argumentsJson) as Record<string, unknown>
      } catch {
        logger.warn('Failed to parse tool call arguments')
      }

      yield {
        type: 'tool_call_end',
        index: idx,
        toolCall: { type: 'tool_call', id: toolCall.id, name: toolCall.name, arguments: args },
        partial: buildAssistantMessage(state),
      }
    }

    yield { type: 'done', reason: state.stopReason, message: buildAssistantMessage(state) }
  }

  async healthCheck(token: string): Promise<boolean> {
    try {
      const response = await fetch('https://api.deepseek.com/models', {
        headers: {
          authorization: `Bearer ${token}`,
        },
      })

      return response.ok
    } catch {
      return false
    }
  }
}

export function createOpenAICompletionsProvider(
  options: OpenAICompatibleProviderOptions = {},
): ProviderStream {
  return new OpenAICompatibleStream(options.resolveKey, options.resolveBaseUrl)
}
