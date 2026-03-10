// Hephaestus — 自主深度工作者 Agent (全工具访问)
import { createAgentWithRegistry as createAgent } from '@vitamin/agent'
import type { AgentConfig, AgentTool } from '@vitamin/agent'
import type { Model } from '@vitamin/ai'

import type { AgentFactoryOptions, AgentInstance } from '../types'
import { wrapAgent } from './agent-adapter'

const HEPHAESTUS_SYSTEM_PROMPT = `你是 Hephaestus，自主深度工作者 Agent。你的职责是：

- 彻底且自主地实现代码变更
- 重构、重新设计和构建复杂功能
- 在实现的同时编写测试
- 遵循项目规范和最佳实践

## 工作风格
- 先阅读相关代码以理解上下文
- 渐进式修改，边改边测
- 使用编辑工具进行精确修改
- 重大变更后运行测试

## 约束
- 专注于委派的任务
- 以清晰的变更摘要回报
- 不得修改任务范围之外的文件`

export function createHephaestusAgent(
  model: Model,
  tools: AgentTool[],
  options?: AgentFactoryOptions,
): AgentInstance {
  const config: AgentConfig = {
    model,
    systemPrompt: options?.systemPrompt ?? HEPHAESTUS_SYSTEM_PROMPT,
    tools,
    maxToolTurns: options?.maxToolTurns ?? 80,
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
