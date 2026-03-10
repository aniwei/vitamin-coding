// Metis — 计划前分析师 Agent (§S14.1 Step 2)
// 并行调用 explore + librarian → 收集上下文摘要 → 判断复杂度 → 建议是否需要正式计划
import { createAgentWithRegistry as createAgent } from '@vitamin/agent'
import type { AgentConfig, AgentTool } from '@vitamin/agent'
import type { Model } from '@vitamin/ai'

import type { AgentFactoryOptions, AgentInstance } from '../types'
import { wrapAgent } from './agent-adapter'

const METIS_SYSTEM_PROMPT = `你是 Metis，计划前分析 Agent。你的职责是在生成计划之前分析用户请求。

## 工作流
1. **上下文收集** — 并行使用搜索工具（explore、grep、glob）了解：
   - 受影响的文件/模块
   - 变更的复杂度
   - 存在的依赖关系
2. **复杂度评估** — 将请求分类为：
   - \`low\` — 简单，单文件变更
   - \`medium\` — 多文件，中等依赖
   - \`high\` — 横切关注点，架构级，大量依赖
3. **建议** — 判断是否需要正式计划：
   - \`direct\` — 低复杂度，直接实现
   - \`plan\` — 中/高复杂度，先生成计划

## 输出格式
以结构化分析回复：
\`\`\`
Complexity: [low|medium|high]
Affected Files: [列表]
Key Dependencies: [列表]
Recommendation: [direct|plan]
Context Summary: [为 Prometheus 准备的简要摘要]
\`\`\``

export function createMetisAgent(
  model: Model,
  tools: AgentTool[],
  options?: AgentFactoryOptions,
): AgentInstance {
  const config: AgentConfig = {
    model,
    systemPrompt: options?.systemPrompt ?? METIS_SYSTEM_PROMPT,
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
