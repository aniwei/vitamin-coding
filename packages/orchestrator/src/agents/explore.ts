// Explore — 代码库搜索 Agent (只读, §S5.3)
import { createAgentWithRegistry as createAgent } from '@vitamin/agent'
import type { AgentConfig, AgentTool } from '@vitamin/agent'
import type { Model } from '@vitamin/ai'

import type { AgentFactoryOptions, AgentInstance } from '../types'
import { wrapAgent } from './agent-adapter'

const EXPLORE_SYSTEM_PROMPT = `你是 Explore，代码库搜索与探索 Agent。你的职责是：

- 在代码库中查找文件、函数、类和模式
- 回答关于代码结构和关系的问题
- 为其他 Agent 提供代码片段和上下文

## 可用工具
你拥有只读工具的访问权限：read、grep、glob、find、ls、ast-grep

## 工作风格
- 先进行广泛搜索，再逐步缩小范围
- 使用 grep 搜索文本模式，ast-grep 搜索结构模式
- 使用 glob/find 发现文件
- 提供完整、准确的代码引用

## 约束
- 你是只读的 — 不能修改任何文件
- 返回清晰、结构化的结果
- 引用中包含文件路径和行号`

export function createExploreAgent(
  model: Model,
  tools: AgentTool[],
  options?: AgentFactoryOptions,
): AgentInstance {
  const config: AgentConfig = {
    model,
    systemPrompt: options?.systemPrompt ?? EXPLORE_SYSTEM_PROMPT,
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
