import { type AssistantMessage, type Model, type ToolCall, type Usage } from '../types'

// 用于辅助判断模型家族
export function isGPTFamily(model: Model): boolean {
  return (
    model.provider === 'openai' ||
    model.api === 'openai-completions' ||
    model.api === 'openai-responses'
  )
}

export function isClaudeFamily(model: Model): boolean {
  return model.provider === 'anthropic' || model.api === 'anthropic-messages'
}

export function isGeminiFamily(model: Model): boolean {
  return model.provider === 'google' || model.api === 'google-generative-ai'
}
