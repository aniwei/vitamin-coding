import { describe, expect, it } from 'vitest'

import { createAgentCall, createReviewCall } from '../src/orchestration/agent-call'
import { createAgentTask } from '../src/orchestration/agent-task'

describe('full preset orchestration tools', () => {
  const signal = new AbortController().signal

  describe('agent_call', () => {
    it('returns output when call succeeds', async () => {
      const tool = createAgentCall('/tmp', async (_agent, _prompt) => ({
        success: true,
        output: 'done',
      }))

      const result = await tool.execute({
        id: 'ac1',
        params: {
          agent: 'explore',
          prompt: 'inspect repository',
        },
        signal,
      })

      expect(result.isError).toBeUndefined()
      const text = result.content[0]?.type === 'text' ? result.content[0].text : ''
      expect(text).toContain('done')
    })

    it('throws when call fails', async () => {
      const tool = createAgentCall('/tmp', async () => ({
        success: false,
        error: 'failed upstream',
      }))

      await expect(
        tool.execute({
          id: 'ac2',
          params: {
            agent: 'explore',
            prompt: 'inspect repository',
          },
          signal,
        }),
      ).rejects.toThrow('failed upstream')
    })
  })

  describe('review_call', () => {
    it('returns output when isolated review succeeds', async () => {
      const tool = createReviewCall('/tmp', async (_agent, _prompt) => ({
        success: true,
        output: 'reviewed',
      }))

      const result = await tool.execute({
        id: 'rc1',
        params: {
          agent: 'reviewer',
          prompt: 'check this diff',
          slot: 'critique',
        },
        signal,
      })

      expect(result.isError).toBeUndefined()
      const text = result.content[0]?.type === 'text' ? result.content[0].text : ''
      expect(text).toContain('reviewed')
    })
  })

  describe('agent_task', () => {
    it('delegates to task runtime with agent semantics', async () => {
      const tool = createAgentTask('/tmp', async (args) => ({
        success: true,
        output: `${args.subagent}:${args.prompt}`,
      }))

      const result = await tool.execute({
        id: 'at1',
        params: {
          agent: 'explore',
          prompt: 'scan repo',
          mode: 'sync',
          sessionMode: 'sticky',
        },
        signal,
      })

      expect(result.isError).toBeUndefined()
      const text = result.content[0]?.type === 'text' ? result.content[0].text : ''
      expect(text).toContain('Agent task completed')
      expect(text).toContain('explore:scan repo')
    })

    it('reports background task ids', async () => {
      const tool = createAgentTask('/tmp', async () => ({
        success: true,
        id: 'task-42',
        output: 'queued',
      }))

      const result = await tool.execute({
        id: 'at2',
        params: {
          agent: 'implementer',
          prompt: 'apply patch',
          mode: 'background',
        },
        signal,
      })

      expect(result.isError).toBeUndefined()
      const text = result.content[0]?.type === 'text' ? result.content[0].text : ''
      expect(text).toContain('Agent task started in background: task-42')
      expect(text).toContain('queued')
    })
  })
})
