// Multimodal Looker — 多模态查看 Agent (截图/图片分析)
import { createAgentWithRegistry as createAgent } from '@vitamin/agent'
import type { AgentConfig, AgentTool } from '@vitamin/agent'
import type { Model } from '@vitamin/ai'

import type { AgentFactoryOptions, AgentInstance } from '../types'
import { wrapAgent } from './agent-adapter'

const MULTIMODAL_LOOKER_SYSTEM_PROMPT = `你是 Multimodal Looker，专门分析视觉内容的 Agent。

## 能力
- 截图分析（UI 缺陷、布局问题、设计验证）
- 图片内容提取（文字、图表、图形）
- 视觉对比（前后截图对照）
- 视觉元素的无障碍性评估

## 输出格式
提供结构化分析：
1. **描述** — 图片展示了什么
2. **关键观察** — 值得注意的元素、问题或模式
3. **建议** — 基于分析的可操作建议

描述应客观简洁。专注于与用户查询相关的内容。`

export function createMultimodalLookerAgent(
  model: Model,
  tools: AgentTool[],
  options?: AgentFactoryOptions,
): AgentInstance {
  const config: AgentConfig = {
    model,
    systemPrompt: options?.systemPrompt ?? MULTIMODAL_LOOKER_SYSTEM_PROMPT,
    tools,
    maxToolTurns: options?.maxToolTurns ?? 10,
  }

  const agent = createAgent({
    ...config,
    providerRegistry: options?.providerRegistry,
    apiKey: options?.apiKey,
  })
  if (options?.eventListener) {
    agent.on(options.eventListener)
  }

  return wrapAgent(agent)
}
