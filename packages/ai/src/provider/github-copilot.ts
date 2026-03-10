// GitHub Copilot API 适配器
// 基于 OpenAI Chat Completions 兼容 API，附加 Copilot 专用鉴权头
import { stream, createLogger } from '@vitamin/shared'

import type {
  Api,
  AssistantMessage,
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

const log = createLogger('@vitamin/ai:github-copilot')

// 构建 Copilot 专用请求头
function createCopilotHeaders(token: string, version: string): Record<string, string> {
  return {
    'authorization': `Bearer ${token}`,
    'copilot-integration-id': 'vitamin-coding-agent',
    'editor-version': `vitamin-coding/${version}`,
    'editor-plugin-version': `vitamin-coding/${version}`,
    'openai-intent': 'conversation-panel',
  }
}

// 转换消息格式为 OpenAI Chat Completions 格式
function convertMessages(context: StreamContext): unknown[] {
  const result: unknown[] = []

  if (context.systemPrompt) {
    result.push({ role: 'system', content: context.systemPrompt })
  }

  for (const msg of context.messages) {
    if (msg.role === 'user') {
      if (typeof msg.content === 'string') {
        result.push({ role: 'user', content: msg.content })
      } else {
        result.push({
          role: 'user',
          content: msg.content.map((part) => {
            if (part.type === 'text') return { type: 'text', text: part.text }
            if (part.type === 'image') {
              return {
                type: 'image_url',
                image_url: {
                  url: part.source.type === 'base64'
                    ? `data:${part.source.mediaType};base64,${part.source.data}`
                    : part.source.data,
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
        .map((c) => c.text)
        .join('')

      result.push({
        role: 'assistant',
        content: textParts || null,
        ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
      })
    } else if (msg.role === 'tool_result') {
      result.push({
        role: 'tool',
        tool_call_id: msg.toolCallId,
        content: msg.content.map((c) => (c.type === 'text' ? c.text : '')).join(''),
      })
    }
  }

  return result
}


function convertThinkingLevel(level: string): string {
  switch (level) {
    case 'minimal':
      return 'low'
    case 'low':
      return 'low'
    case 'medium':
      return 'medium'
    case 'high':
      return 'high'
    case 'xhigh':
      return 'high'
    default:
      return 'medium'
  }
}

// 构建请求 body
function createStreamBody(model: Model, context: StreamContext): Record<string, unknown> {
  // Copilot 模型 ID 格式: "github-copilot/gpt-4.1" → 提取 "gpt-4.1"
  const modelId = model.id.includes('/') ? model.id.split('/')[1] : model.id

  const body: Record<string, unknown> = {
    model: modelId,
    messages: convertMessages(context),
    max_tokens: context.maxTokens ?? model.maxOutputTokens,
    stream: true,
    stream_options: { include_usage: true },
  }

  // reasoning 模型不设置 temperature
  if (context.temperature !== undefined && !model.reasoning) {
    body.temperature = context.temperature
  }

  // reasoning 模型使用 reasoning_effort
  if (model.reasoning && context.thinkingLevel) {
    body.reasoning_effort = convertThinkingLevel(context.thinkingLevel)
  }

  // 工具定义
  if (context.tools && context.tools.length > 0) {
    body.tools = context.tools.map((tool) => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: toToolJsonSchema(tool.parameters),
      },
    }))
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

function createStreamState(model: string): CopilotStreamState {
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

function convertMessage(state: CopilotStreamState): AssistantMessage {
  const content: (TextContent | ThinkingContent | ToolCall)[] = []

  if (state.thinkingText) {
    content.push({ 
      type: 'thinking', 
      data: state.thinkingText 
    })
  }

  if (state.textContent) {
    content.push({ 
      type: 'text', 
      data: state.textContent 
    })
  }

  for (const [, tc] of state.toolCalls) {
    let args: Record<string, unknown> = {}

    try {
      args = JSON.parse(tc.argumentsJson) as Record<string, unknown>
    } catch {
      log.warn('Failed to parse tool call arguments for final message')
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

class GithubCopilotStream implements ProviderStream {
  id = 'github-copilot'
  displayName = 'GitHub Copilot'

  async resolveKey(model: Model): Promise<string> {
    return '' // TODO: 从 OAuthRegistry 获取 token
  }

  async *converse(
    model: Model,
    context: StreamContext,
    options: StreamOptions,
    signal: AbortSignal,
  ): AsyncIterable<StreamEvent> {
    const key = await this.resolveKey(model)

    const baseUrl = model.baseUrl ?? 'https://api.githubcopilot.com'
    const url = `${baseUrl}/chat/completions`
    const body = createStreamBody(model, context)

    log.debug({ model: model.id }, 'Starting Copilot stream with body: %o', body)

    const state = createStreamState(model.id)
    let started = false

    const sse = stream({
      url,
      body,
      headers: createCopilotHeaders(key, '1.0.0'), // TODO
      signal,
      timeout: options.timeout ?? 300000,
    })

    for await (const event of sse) {
      if (event.data === '[DONE]') break

      try {
        const data = JSON.parse(event.data) as Record<string, unknown>

        // 处理 usage
        if (data.usage) {
          const usage = data.usage as Record<string, number>
          state.inputTokens = usage.prompt_tokens ?? 0
          state.outputTokens = usage.completion_tokens ?? 0
        }

        const choices = data.choices as Array<Record<string, unknown>> | undefined
        if (!choices || choices.length === 0) continue

        const choice = choices[0]!
        const delta = choice.delta as Record<string, unknown> | undefined
        if (!delta) continue

        // 发送 start 事件
        if (!started) {
          started = true
          yield { type: 'start', partial: convertMessage(state) }
        }

        // finish_reason
        if (choice.finish_reason) {
          const reason = choice.finish_reason as string
          let stopReason: StopReason = 'end_turn'
          if (reason === 'stop') {
            stopReason = 'end_turn'
          } else if (reason === 'length') {
            stopReason = 'max_tokens'
          } else if (reason === 'tool_calls') {
            stopReason = 'tool_use'
          } 

          state.stopReason = stopReason
        }

        // 文本 delta
        if (delta.content) {
          const text = delta.content as string
          state.textContent += text
          yield { type: 'text_delta', index: 0, delta: text }
        }

        // reasoning delta
        if (delta.reasoning) {
          const text = delta.reasoning as string
          state.thinkingText += text
          yield { type: 'thinking_delta', index: 0, delta: text }
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
                toolCall: { type: 'tool_call', id, name, arguments: {} },
              }
            }

            const tc = state.toolCalls.get(idx)!
            if (fn?.arguments) {
              const argDelta = fn.arguments as string
              tc.argumentsJson += argDelta
              yield { type: 'tool_call_delta', id: tc.id, delta: argDelta }
            }
          }
        }
      } catch (error) {
        log.warn({ error }, '解析 Copilot SSE 事件失败')
      }
    }

    // 发送工具调用结束事件
    for (const [, tc] of state.toolCalls) {
      let args: Record<string, unknown> = {}
      try {
        args = JSON.parse(tc.argumentsJson) as Record<string, unknown>
      } catch {
        log.warn('无法解析工具调用参数')
      }
      yield {
        type: 'tool_call_end',
        id: tc.id,
        toolCall: { type: 'tool_call', id: tc.id, name: tc.name, arguments: args },
      }
    }

    // 发送完成事件
    yield { type: 'done', message: buildFinalMessage(state) }
  }

  async healthCheck(key: string, version?: string): Promise<boolean> {
    try {
      const response = await fetch(`https://api.githubcopilot.com/models`, {
        headers: createCopilotHeaders(key, version ?? '1.0.0'), // TODO
      })

      return response.ok
    } catch {
      return false
    }
  }
  
}

// GitHub Copilot Provider 适配器
export function createCopilotProvider(): ProviderStream {
  return new GithubCopilotStream()
}
