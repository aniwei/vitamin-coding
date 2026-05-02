import type { MemoryManager } from '@vitamin/memory'
import type { AgentMessage } from '@vitamin/agent'
import type { Message } from '@vitamin/ai'

type AutoCompactionOutput = {
  messages: AgentMessage[]
  metadata?: Record<string, unknown>
}

export function createAutoCompactionHook(memoryManager: MemoryManager) {
  return {
    name: 'auto-compaction',
    hook: 'messages.transform' as const,
    handler: async (
      input: { messages: AgentMessage[]; sessionId: string },
      output: AutoCompactionOutput,
    ) => {
      const messages = input.messages as Message[]
      const plan = memoryManager.planContextBudget(messages)
      output.metadata = {
        ...output.metadata,
        contextBudget: plan,
      }

      if (!plan.shouldProcess) {
        return
      }

      const result = await memoryManager.process(messages, input.sessionId)
      const afterPlan = memoryManager.planContextBudget(result.messages)

      const snippd = 'snippd' in result && result.snippd === true
      const microCompacted = 'microCompacted' in result && result.microCompacted === true
      const strategies = [
        snippd ? 'snip' : undefined,
        result.pruned ? 'prune' : undefined,
        microCompacted ? 'micro-compact' : undefined,
        result.compacted ? 'compact' : undefined,
      ].filter((strategy): strategy is string => typeof strategy === 'string')

      output.metadata = {
        ...output.metadata,
        contextBudget: {
          before: plan,
          after: afterPlan,
          strategies,
          tokensBefore: plan.tokenEstimate.total,
          tokensAfter: afterPlan.tokenEstimate.total,
          tokensSaved: Math.max(0, plan.tokenEstimate.total - afterPlan.tokenEstimate.total),
          changed: strategies.length > 0,
        },
      }

      if (snippd || result.pruned || microCompacted || result.compacted) {
        output.messages = result.messages as AgentMessage[]
      }
    },
  }
}
