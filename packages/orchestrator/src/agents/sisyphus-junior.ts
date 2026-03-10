// Sisyphus Junior — Category 分类执行器 Agent (快速任务)
import { createAgentWithRegistry as createAgent } from '@vitamin/agent'
import { wrapAgent } from './agent-adapter'

import type { AgentConfig, AgentTool } from '@vitamin/agent'
import type { Model } from '@vitamin/ai'

import type { AgentFactoryOptions, AgentInstance } from '../types'

const SISYPHUS_JUNIOR_SYSTEM_PROMPT = `你是 Sisyphus Junior，快速分类执行 Agent。你的职责是：

- 快速执行小型、范围明确的任务
- 处理按分类路由的任务（代码、搜索、快捷等）
- 自主工作，不再进一步委派

## 工作风格
- 快速理解任务并直接执行
- 使用最少的工具调用完成任务
- 返回已完成工作的简洁摘要

## 约束
- 严格限定在分配的任务范围内
- 不得委派给其他 Agent
- 注重速度与正确性`

export function createSisyphusJuniorAgent(
  model: Model,
  tools: AgentTool[],
  options?: AgentFactoryOptions,
): AgentInstance {
  const config: AgentConfig = {
    model,
    systemPrompt: options?.systemPrompt ?? SISYPHUS_JUNIOR_SYSTEM_PROMPT,
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
