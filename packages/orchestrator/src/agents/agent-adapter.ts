// Agent → AgentInstance 适配工具 (消除 Agent 文件间重复)
import type { AgentEventListener } from '@vitamin/agent'
import type { Agent } from '@vitamin/agent'

import type { AgentInstance, AgentResult } from '../types'

// 将 @vitamin/agent 的 Agent 实例包装为 AgentInstance 接口
export function wrapAgent(agent: Agent): AgentInstance {
  return {
    async prompt(message: string): Promise<AgentResult> {
      const result = await agent.prompt({ role: 'user', content: message, timestamp: Date.now() })
      const output = extractTextContent(result)
      return {
        messages: agent.getState().messages,
        output,
        usage: {
          inputTokens: agent.getState().tokenUsage.input,
          outputTokens: agent.getState().tokenUsage.output,
        },
      }
    },
    abort() {
      agent.abort()
    },
    on(listener: AgentEventListener) {
      agent.on(listener)
    },
  }
}

// 从 AssistantMessage 中提取文本内容
export function extractTextContent(message: { content: unknown }): string {
  if (typeof message.content === 'string') return message.content
  if (Array.isArray(message.content)) {
    return message.content
      .filter((b: { type: string }) => b.type === 'text')
      .map((b: { text: string }) => b.text)
      .join('\n')
  }
  return ''
}
