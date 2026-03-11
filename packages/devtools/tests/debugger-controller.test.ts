import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as childProcess from 'node:child_process'

const execFileSyncMock = vi.fn()

describe('DebuggerController', () => {
  beforeEach(() => {
    execFileSyncMock.mockReset()
    vi.restoreAllMocks()
  })

  it('calls execFileSync with node client and paused payload', async () => {
    vi.spyOn(childProcess, 'execFileSync').mockImplementation(execFileSyncMock)

    const { DebuggerController } = await import('../src/debugger/controller')

    const controller = new DebuggerController('http://localhost:3000/abc/debugger')
    controller.paused({ turn: 1, point: 'model_before' })

    expect(execFileSyncMock).toHaveBeenCalledTimes(1)

    const [cmd, args, options] = execFileSyncMock.mock.calls[0] as [
      string,
      string[],
      { input: string; stdio: string[]; env: NodeJS.ProcessEnv }
    ]

    expect(cmd).toBe('node')
    expect(args).toHaveLength(1)
    expect(args[0].endsWith('/client.js')).toBe(true)
    expect(options.stdio).toEqual(['pipe', 'inherit', 'inherit'])

    const payload = JSON.parse(options.input)
    expect(payload).toEqual({
      serviceUrl: 'http://localhost:3000/abc/debugger',
      type: 'Debugger.paused',
      payload: { turn: 1, point: 'model_before' },
    })
  })
})
