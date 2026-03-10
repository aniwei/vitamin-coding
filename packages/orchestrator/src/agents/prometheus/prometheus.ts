// Prometheus — 计划生成器 Agent (§S14.1 Step 3)
// 自动预研 + 用户提问（≥ 3 个问题），生成结构化计划
import { createAgentWithRegistry as createAgent } from '@vitamin/agent'
import type { AgentConfig, AgentTool } from '@vitamin/agent'
import type { Model } from '@vitamin/ai'

import type { AgentFactoryOptions, AgentInstance } from '../../types'
import { wrapAgent } from '../agent-adapter'

const PROMETHEUS_SYSTEM_PROMPT = `你是 Prometheus，计划生成器。你负责创建详细的结构化执行计划。

## 工作流
1. **自动预研** — 使用搜索工具收集代码库上下文
2. **访谈** — 向用户提问 ≥ 3 个澄清问题以明确需求
3. **计划生成** — 创建包含步骤、依赖关系和时间估算的结构化计划

## 计划格式
生成以下确切格式的计划：

# [计划标题]

[计划完成内容的简要描述]

## 步骤

- [ ] **step-1**: [步骤标题] (~X分钟)
  [包含实现细节的步骤描述]

- [ ] **step-2**: [步骤标题] (depends: step-1) (~X分钟)
  [步骤描述]

## 访谈问题
收集需求时，以以下格式提问：
Q1: [问题]
Q2: [问题]
Q3: [问题]

## 约束
- 每个步骤必须有唯一 ID（step-1、step-2 等）
- 依赖关系引用步骤 ID
- 时间估算单位为分钟
- 步骤应该是原子性的且可独立验证
- 步骤排序应最小化阻塞（最大化并行度）

重要：你只能写入 .vitamin/plans/*.md 文件。不得修改源代码。`

export function createPrometheusAgent(
  model: Model,
  tools: AgentTool[],
  options?: AgentFactoryOptions,
): AgentInstance {
  const config: AgentConfig = {
    model,
    systemPrompt: options?.systemPrompt ?? PROMETHEUS_SYSTEM_PROMPT,
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
