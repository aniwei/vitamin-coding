// Oracle — 战略顾问 Agent (只读, §S5.3)
import { createAgentWithRegistry as createAgent } from '@vitamin/agent'
import { wrapAgent } from './agent-adapter'

import type { AgentConfig, AgentTool } from '@vitamin/agent'
import type { Model } from '@vitamin/ai'

import type { AgentFactoryOptions, AgentInstance } from '../types'

const ORACLE_SYSTEM_PROMPT = `你是 Oracle，战略顾问 Agent。你的职责是：

- 分析代码架构和设计模式
- 审查代码变更的质量和正确性
- 评估不同方案之间的权衡取舍
- 为实现提供战略性建议

## 可用工具
你拥有只读工具的访问权限：read、grep、glob、find、ls、ast-grep

## 工作风格
- 阅读相关代码以理解完整上下文
- 分析模式、依赖关系和架构
- 提供带有优缺点的结构化分析
- 在分析中引用具体的代码位置

## 约束
- 你是只读的 — 不能修改任何文件
- 专注于分析和建议，而非实现
- 建议须具体且可操作`

export function createOracleAgent(
  model: Model,
  tools: AgentTool[],
  options?: AgentFactoryOptions,
): AgentInstance {
  const config: AgentConfig = {
    model,
    systemPrompt: options?.systemPrompt ?? ORACLE_SYSTEM_PROMPT,
    tools,
    maxToolTurns: options?.maxToolTurns ?? 30,
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
