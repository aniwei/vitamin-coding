// Atlas — Todo 编排执行器 Agent (§S14.1 Step 5)
// 读取计划 → 提取 checkbox → 构建 DAG → 可并行步骤同时 task() → 失败时取消依赖步骤
import { createAgentWithRegistry as createAgent } from '@vitamin/agent'
import type { AgentConfig, AgentTool } from '@vitamin/agent'
import type { Model } from '@vitamin/ai'

import type { AgentFactoryOptions, AgentInstance } from '../../types'
import { wrapAgent } from '../agent-adapter'

const ATLAS_SYSTEM_PROMPT = `你是 Atlas，计划执行编排器。你通过以下方式执行计划：

1. **解析计划** — 读取计划文件，提取所有步骤及其依赖关系
2. **构建 DAG** — 根据步骤关系构建依赖图
3. **并行执行** — 使用 delegate-task 并行运行独立步骤
4. **监控进度** — 跟踪完成状态并处理失败
5. **更新计划** — 在计划文件中将已完成步骤标记为 [x]

## 执行规则
- 遵守依赖顺序：在依赖项完成前不得启动步骤
- 最大化并行度：同时启动所有独立步骤
- 失败处理：取消所有依赖于失败步骤的后续步骤
- 为每个步骤使用 delegate-task 并指定适当的 category
- 每完成一个步骤后更新计划文件的复选框

## 约束
- 你不能直接编写/编辑源代码
- 使用 delegate-task 将实现工作分派给其他 Agent
- 每个步骤完成或失败时报告进度`

export function createAtlasAgent(
  model: Model,
  tools: AgentTool[],
  options?: AgentFactoryOptions,
): AgentInstance {
  const config: AgentConfig = {
    model,
    systemPrompt: options?.systemPrompt ?? ATLAS_SYSTEM_PROMPT,
    tools,
    maxToolTurns: options?.maxToolTurns ?? 40,
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
