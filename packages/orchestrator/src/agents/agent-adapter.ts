// Agent → AgentInstance 适配工具 (消除 Agent 文件间重复)
import type { AgentEventListener, AgentMessage, AgentTool } from '@vitamin/agent'
import type { Agent } from '@vitamin/agent'
import type { Model } from '@vitamin/ai'

import type { AgentInstance, AgentResult } from '../types'

// wrapAgent 的运行时配置
export interface WrapAgentConfig {
  model: Model
  systemPrompt: string
  tools: AgentTool[]
  maxToolTurns?: number
}

// 将 @vitamin/agent 的 Agent 实例包装为 AgentInstance 接口
export function wrapAgent(agent: Agent, config: WrapAgentConfig): AgentInstance {
  return {
    async prompt(message: string): Promise<AgentResult> {
      const messages: AgentMessage[] = [
        { role: 'user', content: [{ type: 'text', text: message }] } as AgentMessage,
      ]

      const result = await agent.run({
        model: config.model,
        systemPrompt: config.systemPrompt,
        tools: config.tools,
        messages,
        maxToolTurns: config.maxToolTurns,
      })

      const output = extractTextContent(result)
      return {
        messages,
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
