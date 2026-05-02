import { describe, expect, it } from 'vitest'
import { createAutoCompactionHook } from '../src/hooks/auto-compaction'

import type { AgentMessage } from '@x-mars/agent'

describe('createAutoCompactionHook', () => {
  it('writes back snip-only and micro-compact results', async () => {
    const inputMessages: AgentMessage[] = [
      { role: 'user', content: 'before', timestamp: Date.now() },
    ]
    const outputMessages: AgentMessage[] = [
      { role: 'user', content: 'after', timestamp: Date.now() },
    ]
    const memoryManager = {
      planContextBudget: (messages: AgentMessage[]) => ({
        action: messages === inputMessages ? 'micro-compact' : 'none',
        shouldProcess: messages === inputMessages,
        shouldCompact: false,
        tokenEstimate: { total: messages === inputMessages ? 100 : 60 },
      }),
      process: async () => ({
        messages: outputMessages,
        snippd: false,
        pruned: false,
        microCompacted: true,
        compacted: false,
      }),
    }

    const { handler } = createAutoCompactionHook(memoryManager as never)
    const output = { messages: inputMessages }

    await handler({ messages: inputMessages, sessionId: 'session-1' }, output)

    expect(output.messages).toBe(outputMessages)
    expect(output.metadata?.contextBudget).toMatchObject({
      strategies: ['micro-compact'],
      tokensBefore: 100,
      tokensAfter: 60,
      tokensSaved: 40,
      changed: true,
      before: {
        action: 'micro-compact',
        shouldProcess: true,
      },
      after: {
        action: 'none',
        shouldProcess: false,
      },
    })
  })

  it('skips processing when budget plan is below thresholds', async () => {
    const inputMessages: AgentMessage[] = [
      { role: 'user', content: 'small', timestamp: Date.now() },
    ]
    let processed = false
    const memoryManager = {
      planContextBudget: () => ({
        action: 'none',
        shouldProcess: false,
        shouldCompact: false,
        tokenEstimate: { total: 10 },
      }),
      process: async () => {
        processed = true
        return {
          messages: inputMessages,
          snippd: false,
          pruned: false,
          microCompacted: false,
          compacted: false,
        }
      },
    }

    const { handler } = createAutoCompactionHook(memoryManager as never)
    const output = { messages: inputMessages }

    await handler({ messages: inputMessages, sessionId: 'session-1' }, output)

    expect(processed).toBe(false)
    expect(output.messages).toBe(inputMessages)
    expect(output.metadata?.contextBudget).toMatchObject({
      action: 'none',
      shouldProcess: false,
    })
  })
})
