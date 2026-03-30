import { describe, expect, it } from 'vitest'

import { createAgentCall } from '../src/orchestration/agent-call'

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
          mode: 'sync' as const,
        },
        signal,
      })).rejects.toThrow('failed upstream')
    })
  })
})
