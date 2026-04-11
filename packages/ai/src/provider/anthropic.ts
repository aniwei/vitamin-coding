import Anthropic from '@anthropic-ai/sdk'
import { createLogger, ProviderError } from '@vitamin/shared'
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

const logger = createLogger('@vitamin/ai:anthropic')

// 凭据解析器：由上层（ProviderRegistry）注入
export type AnthropicCredentialResolver = () => Promise<string | undefined>
export type AnthropicBaseUrlResolver = () => Promise<string | undefined>

// baseUrl 解析器：优先级 env > auth.json > model.baseUrl
async function resolveBaseUrl(modelBaseUrl: string, resolver?: AnthropicBaseUrlResolver): Promise<string> {
  const envUrl = process.env['ANTHROPIC_BASE_URL']
  if (envUrl) return envUrl
  if (resolver) {
    const authUrl = await resolver()
    if (authUrl) return authUrl
  }
  return modelBaseUrl
}

// 将 ThinkingLevel 映射为 Anthropic budget_tokens
function toBudgetTokens(level: string, maxOutputTokens: number): number {
  switch (level) {
    case 'minimal': return Math.floor(maxOutputTokens * 0.1)
    case 'low':     return Math.floor(maxOutputTokens * 0.25)
    case 'high':    return Math.floor(maxOutputTokens * 0.75)
    case 'xhigh':   return maxOutputTokens
    default:        return Math.floor(maxOutputTokens * 0.5) // medium
  }
}

// 将内部消息格式转换为 Anthropic messages 格式
function buildAnthropicMessages(messages: Message[]): Anthropic.MessageParam[] {
  const result: Anthropic.MessageParam[] = []

  for (const msg of messages) {
    if (msg.role === 'user') {
      if (typeof msg.content === 'string') {
        result.push({ role: 'user', content: msg.content })
      } else {
        const content: Array<Anthropic.TextBlockParam | Anthropic.ImageBlockParam> = []

        for (const part of msg.content) {
          if (part.type === 'text') {
            content.push({ type: 'text', text: part.text })
          } else if (part.type === 'image') {
            content.push({
              type: 'image',
              source: {
                type: 'base64',
                media_type: part.mime as Anthropic.Base64ImageSource['media_type'],
                data: part.source,
              },
            })
          }
        }

        if (content.length > 0) {
          result.push({ role: 'user', content })
        }
      }
    } else if (msg.role === 'assistant') {
      const content: Anthropic.ContentBlockParam[] = []

      for (const part of msg.content) {
        if (part.type === 'thinking') {
          content.push({
            type: 'thinking',
            thinking: part.text,
            signature: part.signature ?? '',
          } as Anthropic.ThinkingBlockParam)
        } else if (part.type === 'text') {
          if (part.text.trim()) {
            content.push({ type: 'text', text: part.text })
          }
        } else if (part.type === 'tool_call') {
          content.push({
            type: 'tool_use',
            id: part.id,
            name: part.name,
            input: part.arguments,
          })
        }
      }

      if (content.length > 0) {
        result.push({ role: 'assistant', content })
      }
    } else if (msg.role === 'tool_result') {
      const toolContent: Array<Anthropic.TextBlockParam | Anthropic.ImageBlockParam> = []

      for (const c of msg.content) {
        if (c.type === 'text') {
          toolContent.push({ type: 'text', text: c.text })
        } else if (c.type === 'image') {
          toolContent.push({
            type: 'image',
            source: {
              type: 'base64',
              media_type: c.mime as Anthropic.Base64ImageSource['media_type'],
              data: c.source,
            },
          })
        }
      }

      result.push({
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: msg.toolCallId,
            content: toolContent,
            ...(msg.isError ? { is_error: true } : {}),
          },
        ],
      })
    }
  }

  return result
}

// 映射 Anthropic stop_reason → 内部 StopReason
function mapStopReason(reason: string | null | undefined): StopReason {
  switch (reason) {
    case 'end_turn':      return 'end_turn'
    case 'max_tokens':   return 'max_tokens'
    case 'tool_use':     return 'tool_use'
    case 'stop_sequence': return 'stop_sequence'
    default:             return 'end_turn'
  }
}

// 流状态
interface AnthropicStreamState {
  model: string
  textContent: string
  thinkingText: string
  thinkingSignature: string
  toolCalls: Map<number, { id: string; name: string; inputJson: string }>
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  stopReason: StopReason
}

function initStreamState(modelId: string): AnthropicStreamState {
  return {
    model: modelId,
    textContent: '',
    thinkingText: '',
    thinkingSignature: '',
    toolCalls: new Map(),
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    stopReason: 'end_turn',
  }
}

function buildAssistantMessage(state: AnthropicStreamState): AssistantMessage {
  const content: (TextContent | ThinkingContent | ToolCall)[] = []

  if (state.thinkingText) {
    content.push({
      type: 'thinking',
      text: state.thinkingText,
      signature: state.thinkingSignature,
    })
  }

  if (state.textContent) {
    content.push({ type: 'text', text: state.textContent })
  }

  for (const [, tc] of state.toolCalls) {
    let args: Record<string, unknown> = {}
    try {
      args = JSON.parse(tc.inputJson) as Record<string, unknown>
    } catch {
      // 流式传输中 inputJson 可能不完整，忽略解析失败
    }
    content.push({ type: 'tool_call', id: tc.id, name: tc.name, arguments: args })
  }

  return {
    role: 'assistant',
    content,
    api: 'anthropic-messages',
    provider: 'anthropic',
    model: state.model,
    usage: {
      inputTokens: state.inputTokens,
      outputTokens: state.outputTokens,
      cacheReadTokens: state.cacheReadTokens,
      cacheWriteTokens: state.cacheWriteTokens,
    },
    stopReason: state.stopReason,
  }
}

export interface AnthropicProviderOptions {
  resolveKey?: AnthropicCredentialResolver
  resolveBaseUrl?: AnthropicBaseUrlResolver
}

class AnthropicStream implements ProviderStream {
  readonly id = 'anthropic-messages'
  readonly displayName = 'Anthropic'

  constructor(
    private readonly resolveCredential?: AnthropicCredentialResolver,
    private readonly baseUrlResolver?: AnthropicBaseUrlResolver,
  ) {}

  async resolveKey(_model: Model): Promise<string> {
    if (this.resolveCredential) {
      const key = await this.resolveCredential()
      if (key) return key
    }

    const envKey = process.env['ANTHROPIC_API_KEY']
    if (envKey) return envKey

    throw new ProviderError(
      'Missing Anthropic API key. Set ANTHROPIC_API_KEY or configure via auth file.',
      { code: 'PROVIDER_AUTH_MISSING' },
    )
  }

  async *converse(
    model: Model,
    context: StreamContext,
    _options: StreamOptions,
    signal: AbortSignal,
  ): AsyncIterable<StreamEvent> {
    const apiKey = await this.resolveKey(model)
    const baseURL = await resolveBaseUrl(model.baseUrl, this.baseUrlResolver)
    const client = new Anthropic({ apiKey, baseURL })

    const state = initStreamState(model.id)
    let started = false
    let currentBlockType: 'text' | 'thinking' | 'tool_use' | null = null

    const tools: Anthropic.Tool[] = context.tools
      ? context.tools.map((t) => ({
          name: t.name,
          description: t.description,
          input_schema: (t.parameters.toJSONSchema?.() ?? {}) as Anthropic.Tool['input_schema'],
        }))
      : []

    const effectiveMaxTokens = context.maxTokens ?? model.maxOutputTokens

    const requestParams: Anthropic.MessageStreamParams = {
      model: model.name,
      max_tokens: effectiveMaxTokens,
      ...(context.systemPrompt ? { system: context.systemPrompt } : {}),
      messages: buildAnthropicMessages(context.messages),
      ...(tools.length > 0 ? { tools } : {}),
      ...(context.temperature !== undefined && !model.reasoning
        ? { temperature: context.temperature }
        : {}),
      ...(model.reasoning && context.thinkingLevel
        ? {
            thinking: {
              type: 'enabled' as const,
              budget_tokens: toBudgetTokens(context.thinkingLevel, effectiveMaxTokens),
            },
          }
        : {}),
    }

    logger.debug({ model: model.id, baseURL }, 'Starting Anthropic stream')

    try {
      const stream = client.messages.stream(requestParams, { signal })

      for await (const event of stream) {
        if (!started) {
          started = true
          yield { type: 'start', partial: buildAssistantMessage(state) }
        }

        switch (event.type) {
          case 'message_start': {
            const u = event.message.usage
            state.inputTokens = u.input_tokens
            state.outputTokens = u.output_tokens
            if (u.cache_read_input_tokens != null) state.cacheReadTokens = u.cache_read_input_tokens
            if (u.cache_creation_input_tokens != null) state.cacheWriteTokens = u.cache_creation_input_tokens
            break
          }

          case 'content_block_start': {
            const block = event.content_block

            if (block.type === 'text') {
              currentBlockType = 'text'
              yield { type: 'text_start', index: 0, partial: buildAssistantMessage(state) }
            } else if (block.type === 'thinking') {
              currentBlockType = 'thinking'
              yield { type: 'thinking_start', index: 0, partial: buildAssistantMessage(state) }
            } else if (block.type === 'tool_use') {
              currentBlockType = 'tool_use'
              const toolIndex = state.toolCalls.size
              state.toolCalls.set(toolIndex, { id: block.id, name: block.name, inputJson: '' })
              yield { type: 'tool_call_start', index: toolIndex, partial: buildAssistantMessage(state) }
            }
            break
          }

          case 'content_block_delta': {
            const delta = event.delta

            if (delta.type === 'text_delta') {
              state.textContent += delta.text
              yield { type: 'text_delta', index: 0, delta: delta.text, partial: buildAssistantMessage(state) }
            } else if (delta.type === 'thinking_delta') {
              state.thinkingText += delta.thinking
              yield { type: 'thinking_delta', index: 0, delta: delta.thinking, partial: buildAssistantMessage(state) }
            } else if (delta.type === 'signature_delta') {
              state.thinkingSignature += delta.signature
            } else if (delta.type === 'input_json_delta') {
              const toolIndex = state.toolCalls.size - 1
              const tc = state.toolCalls.get(toolIndex)
              if (tc) {
                tc.inputJson += delta.partial_json
                yield { type: 'tool_call_delta', index: toolIndex, delta: delta.partial_json, partial: buildAssistantMessage(state) }
              }
            }
            break
          }

          case 'content_block_stop': {
            if (currentBlockType === 'text') {
              yield { type: 'text_end', index: 0, content: state.textContent, partial: buildAssistantMessage(state) }
            } else if (currentBlockType === 'thinking') {
              yield { type: 'thinking_end', index: 0, content: state.thinkingText, partial: buildAssistantMessage(state) }
            } else if (currentBlockType === 'tool_use') {
              const toolIndex = state.toolCalls.size - 1
              const tc = state.toolCalls.get(toolIndex)
              if (tc) {
                let args: Record<string, unknown> = {}
                try {
                  args = JSON.parse(tc.inputJson) as Record<string, unknown>
                } catch {
                  logger.warn('Failed to parse tool input JSON for %s', tc.name)
                }
                yield {
                  type: 'tool_call_end',
                  index: toolIndex,
                  toolCall: { type: 'tool_call', id: tc.id, name: tc.name, arguments: args },
                  partial: buildAssistantMessage(state),
                }
              }
            }
            currentBlockType = null
            break
          }

          case 'message_delta': {
            state.outputTokens = event.usage.output_tokens
            state.stopReason = mapStopReason(event.delta.stop_reason)
            break
          }

          case 'message_stop':
            break
        }
      }

      yield { type: 'done', reason: state.stopReason, message: buildAssistantMessage(state) }
    } catch (error) {
      if (error instanceof Anthropic.APIError) {
        yield {
          type: 'error',
          error: new ProviderError(`Anthropic API error ${error.status}: ${error.message}`, {
            code: 'PROVIDER_API_ERROR',
            cause: error,
          }),
        }
      } else if (error instanceof Error) {
        yield { type: 'error', error }
      } else {
        yield {
          type: 'error',
          error: new ProviderError('Unknown Anthropic stream error', { code: 'PROVIDER_STREAM_ERROR' }),
        }
      }
    }
  }

  async healthCheck(token: string): Promise<boolean> {
    try {
      const baseURL = process.env['ANTHROPIC_BASE_URL'] ?? 'https://api.anthropic.com'
      const client = new Anthropic({ apiKey: token, baseURL })
      await client.models.list()
      return true
    } catch {
      return false
    }
  }
}

export function createAnthropicProvider(options: AnthropicProviderOptions = {}): ProviderStream {
  return new AnthropicStream(options.resolveKey, options.resolveBaseUrl)
}
