import { describe, expect, it } from 'vitest'

import { createAgentCall } from '../src/orchestration/agent-call'
import { createPerformWork } from '../src/orchestration/perform-work'

describe('full preset orchestration tools', () => {
  const signal = new AbortController().signal

  describe('perform_work', () => {
    it('returns success when performWork succeeds', async () => {
      const tool = createPerformWork('/tmp', async () => ({
        success: true,
        error: new Error(''),
      }))

      const result = await tool.execute({
        id: 'pw1',
        params: { name: 'demo-plan' },
        signal,
      })

      expect(result.isError).toBeUndefined()
      const text = result.content[0]?.type === 'text' ? result.content[0].text : ''
      expect(text).toContain('Work started successfully')
    })

    it('returns isError when performWork fails', async () => {
      const tool = createPerformWork('/tmp', async () => ({
        success: false,
        error: new Error('boom'),
      }))

      const result = await tool.execute({
        id: 'pw2',
        params: { name: 'demo-plan' },
        signal,
      })

      expect(result.isError).toBe(true)
      const text = result.content[0]?.type === 'text' ? result.content[0].text : ''
      expect(text).toContain('Failed to start work')
      expect(text).toContain('boom')
    })
  })

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
          mode: 'sync',
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

      await expect(tool.execute({
        id: 'ac2',
        params: {
          agent: 'explore',
          prompt: 'inspect repository',
        },
        signal,
      })).rejects.toThrow('failed upstream')
    })
  })
})
