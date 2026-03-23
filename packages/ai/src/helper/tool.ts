import { type AssistantMessage, type ToolCall } from '../types'

// 从 AssistantMessage 提取工具调用
export function getToolCallsByAssistantMessage(message: AssistantMessage): ToolCall[] {
  return message.content.filter((c): c is ToolCall => c.type === 'tool_call')
}

// 检查 AssistantMessage 是否包含工具调用
export function hasToolCalls(message: AssistantMessage): boolean {
  return message.content.some(c => c.type === 'tool_call')
}
