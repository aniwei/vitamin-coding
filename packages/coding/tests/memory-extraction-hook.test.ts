import { describe, expect, it } from 'vitest'
import { createMemoryExtractionHooks } from '../src/hooks/memory-extraction'

import type { AgentMessage } from '@vitamin/agent'

function makeSession(messages: AgentMessage[]) {
  let metadata = {
    createdAt: 0,
    lastActiveAt: 0,
    messageCount: messages.length,
    compactionCount: 0,
    tags: [] as string[],
    memoryExtraction: undefined as { lastMessageCount: number } | undefined,
  }

  return {
    session: {
      messages: () => messages,
      metadata: () => metadata,
      updateMetadata: (patch: Partial<typeof metadata>) => {
        metadata = { ...metadata, ...patch }
      },
    },
  }
}

describe('createMemoryExtractionHooks', () => {
  it('extracts again after another trigger-sized batch of messages', async () => {
    const messages: AgentMessage[] = [
      { role: 'user', content: '1', timestamp: Date.now() },
      { role: 'user', content: '2', timestamp: Date.now() },
    ]
    let calls = 0
    const memoryManager = {
      getMemoryExtractionTriggerMessageCount: () => 2,
      extractMemories: async () => {
        calls++
        return { entries: [], indexUpdated: false }
      },
      resetExtractionCounter: () => {},
    }

    const [idleHook] = createMemoryExtractionHooks(
      () => makeSession(messages) as never,
      () => memoryManager as never,
    )

    await idleHook!.handle({ sessionId: 'session-1', metadata: {} })
    await idleHook!.handle({ sessionId: 'session-1', metadata: {} })
    expect(calls).toBe(1)

    messages.push(
      { role: 'user', content: '3', timestamp: Date.now() },
      { role: 'user', content: '4', timestamp: Date.now() },
    )

    await idleHook!.handle({ sessionId: 'session-1', metadata: {} })
    expect(calls).toBe(2)
  })

  it('passes only new messages with a small context window to extraction', async () => {
    const messages: AgentMessage[] = [
      { role: 'user', content: '1', timestamp: Date.now() },
      { role: 'user', content: '2', timestamp: Date.now() },
      { role: 'user', content: '3', timestamp: Date.now() },
      { role: 'user', content: '4', timestamp: Date.now() },
    ]
    const batches: Array<readonly AgentMessage[]> = []
    const memoryManager = {
      getMemoryExtractionTriggerMessageCount: () => 2,
      extractMemories: async (batch: readonly AgentMessage[]) => {
        batches.push(batch)
        return { entries: [], indexUpdated: false }
      },
      resetExtractionCounter: () => {},
    }

    const [idleHook] = createMemoryExtractionHooks(
      () => makeSession(messages) as never,
      () => memoryManager as never,
    )

    await idleHook!.handle({ sessionId: 'session-1', metadata: {} })
    messages.push(
      { role: 'user', content: '5', timestamp: Date.now() },
      { role: 'user', content: '6', timestamp: Date.now() },
    )
    await idleHook!.handle({ sessionId: 'session-1', metadata: {} })

    expect(batches).toHaveLength(2)
    expect(batches[0]!.map((m) => m.content)).toEqual(['1', '2', '3', '4'])
    expect(batches[1]!.map((m) => m.content)).toEqual(['3', '4', '5', '6'])
  })

  it('resumes extraction waterline from session metadata', async () => {
    const messages: AgentMessage[] = [
      { role: 'user', content: '1', timestamp: Date.now() },
      { role: 'user', content: '2', timestamp: Date.now() },
      { role: 'user', content: '3', timestamp: Date.now() },
      { role: 'user', content: '4', timestamp: Date.now() },
    ]
    const session = makeSession(messages)
    session.session.updateMetadata({ memoryExtraction: { lastMessageCount: 2 } })
    let calls = 0
    const memoryManager = {
      getMemoryExtractionTriggerMessageCount: () => 2,
      extractMemories: async () => {
        calls++
        return { entries: [], indexUpdated: false }
      },
      resetExtractionCounter: () => {},
    }

    const [idleHook] = createMemoryExtractionHooks(
      () => session as never,
      () => memoryManager as never,
    )

    await idleHook!.handle({ sessionId: 'session-1', metadata: {} })

    expect(calls).toBe(1)
    expect(session.session.metadata().memoryExtraction?.lastMessageCount).toBe(4)
  })
})
