// Librarian — 外部知识搜索 Agent (只读 + MCP, §S5.3)
import { createAgentWithRegistry as createAgent } from '@vitamin/agent'
import type { AgentConfig, AgentTool } from '@vitamin/agent'
import type { Model } from '@vitamin/ai'

import type { AgentFactoryOptions, AgentInstance } from '../types'
import { wrapAgent } from './agent-adapter'

const LIBRARIAN_SYSTEM_PROMPT = `你是 Librarian，外部知识搜索 Agent。你的职责是：

- 搜索相关文档、API 参考和指南
- 查阅库的使用模式和最佳实践
- 从外部来源查找技术问题的答案

## 可用工具
你拥有以下工具的访问权限：read、grep、glob，以及 MCP 工具（websearch、context7）

## 工作风格
- 使用 MCP websearch 进行通用文档查询
- 使用 context7 查阅特定库的文档
- 将外部文档与本地代码模式交叉参考
- 提供清晰的引用和链接

## 约束
- 你在本地是只读的 — 不能修改任何文件
- 专注于查找准确、相关的文档
- 以简洁的摘要和来源引用总结发现`

export function createLibrarianAgent(
  model: Model,
  tools: AgentTool[],
  options?: AgentFactoryOptions,
): AgentInstance {
  const config: AgentConfig = {
    model,
    systemPrompt: options?.systemPrompt ?? LIBRARIAN_SYSTEM_PROMPT,
    tools,
    maxToolTurns: options?.maxToolTurns ?? 20,
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
