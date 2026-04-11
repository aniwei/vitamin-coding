import { Agent } from '@vitamin/agent'
import type { AssistantMessage } from '@vitamin/ai'
import type { SwarmAgentDef, SwarmContext, SwarmRunContextFactory, SwarmTurnResult } from '../types'

/**
 * 执行单个 Agent 的一次回合。
 * 所有编排模式共用此函数来调度单个 Agent。
 */
export async function executeAgentTurn(options: {
  agentDef: SwarmAgentDef
  input: string
  context: SwarmContext
  createRunContext: SwarmRunContextFactory
  signal: AbortSignal
  extraTools?: import('@vitamin/agent').AgentTool[]
}): Promise<SwarmTurnResult> {
  const { agentDef, input, context, createRunContext, signal, extraTools } = options
  const startTime = Date.now()

  // 设置 active agent
  context.activeAgentId = agentDef.id

  // 宿主提供完整的 AgentRunContext
  const runContext = await createRunContext(agentDef, context, signal)

  // 合并 swarm 注入的额外工具（如 handoff tool）
  if (extraTools && extraTools.length > 0) {
    runContext.tools = [...runContext.tools, ...extraTools]
  }

  // 注入用户输入到 messages
  runContext.messages.push({
    role: 'user',
    content: [{ type: 'text', text: input }],
    timestamp: Date.now(),
  } as import('@vitamin/ai').UserMessage)

  // 创建临时 Agent 执行
  const agent = new Agent()
  const result: AssistantMessage = await agent.run(runContext)

  // 提取文本
  const text = result.content
    .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
    .map((c) => c.text)
    .join('\n')

  const durationMs = Date.now() - startTime

  return {
    agentId: agentDef.id,
    messages: runContext.messages,
    text,
    tokenUsage: {
      input: result.usage.inputTokens,
      output: result.usage.outputTokens,
      cacheRead: result.usage.cacheReadTokens,
    },
    durationMs,
  }
}
