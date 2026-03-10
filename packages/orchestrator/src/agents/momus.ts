// Momus — 计划审查员 Agent (§S14.1 Step 4)
// temperature=0.1, 80% 通过偏好, 拒绝时最多 3 条 issue
import { createAgentWithRegistry as createAgent } from '@vitamin/agent'
import type { AgentConfig, AgentTool } from '@vitamin/agent'
import type { Model } from '@vitamin/ai'

import type { AgentFactoryOptions, AgentInstance } from '../types'
import { wrapAgent } from './agent-adapter'

const MOMUS_SYSTEM_PROMPT = `你是 Momus，计划审查员。你审查 Prometheus 生成的计划质量和可行性。

## 审查标准
1. **完整性** — 计划是否覆盖了请求的所有方面？
2. **可行性** — 各步骤在技术上是否可实现？
3. **依赖关系** — 依赖关系是否被正确识别和排序？
4. **风险** — 是否有未处理的潜在问题或边界情况？
5. **范围** — 计划的范围是否恰当（不过宽、不过窄）？

## 审查策略
- **80% 通过偏好** — 大体合理的计划即使不完美也应通过
- **最多 3 条问题** — 拒绝时最多列出 3 条具体问题
- **建设性反馈** — 始终说明如何修复问题

## 输出格式
通过时：
\`\`\`
[OKAY]
Summary: 简要通过摘要
\`\`\`

拒绝时：
\`\`\`
[REJECT]
Issues:
1. [具体问题 + 修复建议]
2. [具体问题 + 修复建议]
3. [具体问题 + 修复建议]
\`\`\`

重要：你有 80% 的通过偏好。只在存在会导致实现失败的重大问题时才拒绝计划。`

export function createMomusAgent(
  model: Model,
  tools: AgentTool[],
  options?: AgentFactoryOptions,
): AgentInstance {
  const config: AgentConfig = {
    model,
    systemPrompt: options?.systemPrompt ?? MOMUS_SYSTEM_PROMPT,
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

// 解析 Momus 审查结果
export interface MomusReviewResult {
  approved: boolean
  summary?: string
  issues: string[]
}

export function parseMomusOutput(output: string): MomusReviewResult {
  const approved = output.includes('[OKAY]')
  const rejected = output.includes('[REJECT]')

  if (approved && !rejected) {
    const summaryMatch = output.match(/Summary:\s*(.+)/i)
    return {
      approved: true,
      summary: summaryMatch?.[1]?.trim(),
      issues: [],
    }
  }

  // 提取 issue 列表
  const issues: string[] = []
  const issuePattern = /^\d+\.\s*(.+)/gm
  let match = issuePattern.exec(output)
  while (match) {
    const issueText = match[1]
    if (issueText) {
      issues.push(issueText.trim())
    }
    match = issuePattern.exec(output)
  }

  return {
    approved: false,
    issues: issues.slice(0, 3), // 最多 3 条
  }
}
