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

const logger = createLogger('@vitamin/ai:github-copilot')

const PROVIDER_VERSION = '1.0.0'
const DEFAULT_COPILOT_INTEGRATION_ID = 'vscode-chat'

// 构建 Copilot 专用静态请求头
function buildCopilotHeaders(token: string): Record<string, string> {
  const integrationId =
    process.env['VITAMIN_COPILOT_INTEGRATION_ID'] || DEFAULT_COPILOT_INTEGRATION_ID

  return {
    authorization: `Bearer ${token}`,
    'copilot-integration-id': integrationId,
    'editor-version': `vitamin-coding/${PROVIDER_VERSION}`,
    'editor-plugin-version': `vitamin-coding/${PROVIDER_VERSION}`,
    'openai-intent': 'conversation-panel',
  }
}

// 根据最后一条消息推断 Copilot X-Initiator 头。
// Copilot 使用此头区分用户主动发起和 agent 跟进请求。
export function inferCopilotInitiator(messages: Message[]): 'user' | 'agent' {
  const last = messages[messages.length - 1]
  return last && last.role !== 'user' ? 'agent' : 'user'
}

// 检查消息中是否包含图片输入。
// Copilot 需要在包含图片时设置 Copilot-Vision-Request 头。
export function hasCopilotVisionInput(messages: Message[]): boolean {
  return messages.some((msg) => {
    if (msg.role === 'user' && Array.isArray(msg.content)) {
      return msg.content.some((c) => c.type === 'image')
    }
    if (msg.role === 'tool_result' && Array.isArray(msg.content)) {
      return msg.content.some((c) => c.type === 'image')
    }
    return false
  })
}

// 构建请求时的动态 Copilot 头（X-Initiator、Vision 等）
export function buildCopilotDynamicHeaders(params: {
  messages: Message[]
  hasImages: boolean
}): Record<string, string> {
  const headers: Record<string, string> = {
    'X-Initiator': inferCopilotInitiator(params.messages),
    'Openai-Intent': 'conversation-edits',
  }
  if (params.hasImages) {
    headers['Copilot-Vision-Request'] = 'true'
  }
  return headers
}

// 清理 Unicode 代理对（surrogate pairs）以避免 JSON 序列化问题
function sanitizeSurrogates(text: string): string {
  return text.replace(
    /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g,
    '\uFFFD',
  )
}

// 检查消息历史中是否包含工具调用或工具结果
// 部分 provider 在消息含 tool_calls/tool_result 时要求 tools 参数存在（参照 pi-mono）
function hasToolHistory(messages: Message[]): boolean {
  for (const msg of messages) {
    if (msg.role === 'tool_result') {
      return true
    }
    if (msg.role === 'assistant') {
      if (msg.content.some((b) => b.type === 'tool_call')) {
        return true
      }
    }
  }
  return false
}

// 将内部消息格式转换为 OpenAI Chat Completions 格式
function buildOpenAIMessages(context: StreamContext): unknown[] {
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
    } else if (msg.role === 'assistant') {
      const toolCalls = msg.content
        .filter((c): c is ToolCall => c.type === 'tool_call')
        .map((tc) => ({
          id: tc.id,
          type: 'function',
          function: {
            name: tc.name,
            arguments: JSON.stringify(tc.arguments),
          },
        }))

      const textParts = msg.content
        .filter((c): c is TextContent => c.type === 'text')
        .filter((c) => c.text && c.text.trim().length > 0)
        .map((c) => sanitizeSurrogates(c.text))
        .join('')

      // 跳过无内容且无 tool_calls 的 assistant 消息（参照 pi-mono）
      if (!textParts && toolCalls.length === 0) {
        continue
      }

      result.push({
        role: 'assistant',
        content: textParts || null,
        ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
      })
    } else if (msg.role === 'tool_result') {
      result.push({
        role: 'tool',
        tool_call_id: msg.toolCallId,
        content: sanitizeSurrogates(
          msg.content.map((c) => (c.type === 'text' ? c.text : '')).join(''),
        ),
      })
    }
  }

  return result
}

// 将 ThinkingLevel 映射为 OpenAI reasoning_effort 参数值
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

// 将 ZodType 转为 JSON Schema
function toJsonSchema(schema: { toJSONSchema?: () => unknown }): unknown {
  return schema.toJSONSchema?.() ?? {}
}

// 构建完整请求 body
function buildRequestBody(model: Model, context: StreamContext): Record<string, unknown> {
  // Copilot 模型 ID 格式: "github-copilot/gpt-4.1" → 提取 "gpt-4.1"
  const modelId = model.id.includes('/') ? model.id.split('/')[1] : model.id

  const body: Record<string, unknown> = {
    model: modelId,
    messages: buildOpenAIMessages(context),
    max_tokens: context.maxTokens ?? model.maxOutputTokens,
    stream: true,
    stream_options: { include_usage: true },
  }

  // reasoning 模型不设置 temperature
  if (context.temperature !== undefined && !model.reasoning) {
    body.temperature = context.temperature
  }

  // reasoning 模型使用 reasoning_effort（参照 pi-mono）
  if (model.reasoning && context.thinkingLevel) {
    body.reasoning_effort = toReasoningEffort(context.thinkingLevel)
  }

  // 工具定义
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
    // 消息含 tool_calls/tool_result 时注入空 tools 数组（参照 pi-mono）
    body.tools = []
  }

  return body
}

// 流状态
interface CopilotStreamState {
  model: string
  textContent: string
  thinkingText: string
  toolCalls: Map<number, { id: string; name: string; argumentsJson: string }>
  inputTokens: number
  outputTokens: number
  stopReason: 'end_turn' | 'max_tokens' | 'tool_use' | 'stop_sequence'
}

function initStreamState(model: string): CopilotStreamState {
  return {
    model,
    textContent: '',
    thinkingText: '',
    toolCalls: new Map(),
    inputTokens: 0,
    outputTokens: 0,
    stopReason: 'end_turn',
  }
}

// 将当前流状态组装为 AssistantMessage 快照
function buildAssistantMessage(state: CopilotStreamState): AssistantMessage {
  const content: (TextContent | ThinkingContent | ToolCall)[] = []

  if (state.thinkingText) {
    content.push({
      type: 'thinking',
      text: state.thinkingText,
    })
  }

  if (state.textContent) {
    content.push({
      type: 'text',
      text: state.textContent,
    })
  }

  for (const [, tc] of state.toolCalls) {
    let args: Record<string, unknown> = {}

    try {
      args = JSON.parse(tc.argumentsJson) as Record<string, unknown>
    } catch {
      // Tool arguments arrive incrementally during streaming; partial JSON is expected.
    }

    content.push({
      type: 'tool_call',
      id: tc.id,
      name: tc.name,
      arguments: args,
    })
  }

  return {
    role: 'assistant',
    content,
    api: 'github-copilot',
    provider: 'github-copilot',
    usage: {
      inputTokens: state.inputTokens,
      outputTokens: state.outputTokens,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    },
    stopReason: state.stopReason,
    model: state.model,
  }
}

// 凭据解析器：由上层（如 coding session）注入，负责存储管理与过期刷新
export type CopilotCredentialResolver = () => Promise<string | undefined>

class GitHubCopilotStream implements ProviderStream {
  readonly id = 'github-copilot'
  readonly displayName = 'GitHub Copilot'

  constructor(private readonly resolveOAuthAccessKey?: CopilotCredentialResolver) {}

  async resolveKey(): Promise<string> {
    if (this.resolveOAuthAccessKey) {
      const key = await this.resolveOAuthAccessKey()
      if (key) {
        return key
      }
    }

    throw new ProviderError('Missing GitHub Copilot token.', {
      code: 'PROVIDER_AUTH_MISSING',
    })
  }

  async *converse(
    model: Model,
    context: StreamContext,
    options: StreamOptions,
    signal: AbortSignal,
  ): AsyncIterable<StreamEvent> {
    const key = await this.resolveKey()

    const baseUrl = model.baseUrl ?? 'https://api.githubcopilot.com'
    const url = `${baseUrl}/chat/completions`
    const body = buildRequestBody(model, context)

    logger.debug({ model: model.id }, 'Starting Copilot stream with body: %o', body)

    const state = initStreamState(model.id)
    let started = false

    const sse = stream({
      url,
      body,
      headers: {
        ...buildCopilotHeaders(key),
        ...buildCopilotDynamicHeaders({
          messages: context.messages,
          hasImages: hasCopilotVisionInput(context.messages),
        }),
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

        // 处理 usage（参照 pi-mono：解析 cached_tokens / reasoning_tokens）
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
        if (!choices || choices.length === 0) {
          continue
        }

        const choice = choices[0]!
        const delta = choice.delta as Record<string, unknown> | undefined
        if (!delta) {
          continue
        }

        // 发送 start 事件
        if (!started) {
          started = true
          yield { type: 'start', partial: buildAssistantMessage(state) }
        }

        // finish_reason 映射（参照 pi-mono：增加 content_filter / network_error 处理）
        if (choice.finish_reason) {
          const reason = choice.finish_reason as string
          let stopReason: StopReason = 'end_turn'
          if (reason === 'stop') {
            stopReason = 'end_turn'
          } else if (reason === 'length') {
            stopReason = 'max_tokens'
          } else if (reason === 'tool_calls') {
            stopReason = 'tool_use'
          } else if (reason === 'content_filter' || reason === 'network_error') {
            stopReason = 'end_turn'
            logger.warn(`Provider finish_reason: ${reason}`)
          } else {
            stopReason = 'end_turn'
            logger.warn(`Unknown finish_reason: ${reason}`)
          }

          state.stopReason = stopReason
        }

        // 文本 delta
        if (delta.content) {
          const text = delta.content as string
          state.textContent += text
          yield { type: 'text_delta', index: 0, delta: text, partial: buildAssistantMessage(state) }
        }

        // reasoning delta（参照 pi-mono：检查三个字段 reasoning_content / reasoning / reasoning_text）
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

        // 工具调用 delta
        if (delta.tool_calls) {
          const toolCallDeltas = delta.tool_calls as Array<Record<string, unknown>>
          for (const tcd of toolCallDeltas) {
            const idx = tcd.index as number
            const fn = tcd.function as Record<string, unknown> | undefined

            if (!state.toolCalls.has(idx)) {
              const id = (tcd.id as string) ?? `call_${idx}`
              const name = (fn?.name as string) ?? ''
              state.toolCalls.set(idx, { id, name, argumentsJson: '' })
              yield {
                type: 'tool_call_start',
                index: idx,
                partial: buildAssistantMessage(state),
              }
            }

            const tc = state.toolCalls.get(idx)!
            if (fn?.arguments) {
              const argDelta = fn.arguments as string
              tc.argumentsJson += argDelta
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
        logger.warn({ error }, '解析 Copilot SSE 事件失败')
      }
    }

    // 发送工具调用结束事件
    for (const [idx, tc] of state.toolCalls) {
      let args: Record<string, unknown> = {}
      try {
        args = JSON.parse(tc.argumentsJson) as Record<string, unknown>
      } catch {
        logger.warn('无法解析工具调用参数')
      }
      yield {
        type: 'tool_call_end',
        index: idx,
        toolCall: { type: 'tool_call', id: tc.id, name: tc.name, arguments: args },
        partial: buildAssistantMessage(state),
      }
    }

    // 发送完成事件
    yield { type: 'done', reason: state.stopReason, message: buildAssistantMessage(state) }
  }

  async healthCheck(token: string): Promise<boolean> {
    try {
      const response = await fetch('https://api.githubcopilot.com/models', {
        headers: buildCopilotHeaders(token),
      })

      return response.ok
    } catch {
      return false
    }
  }
}

export interface CopilotProviderOptions {
  resolveOAuthAccessKey?: CopilotCredentialResolver
}

// GitHub Copilot Provider 适配器工厂
export function createCopilotProvider(options: CopilotProviderOptions = {}): ProviderStream {
  return new GitHubCopilotStream(options.resolveOAuthAccessKey)
}
