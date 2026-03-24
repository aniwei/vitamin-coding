import { describe, expect, it } from 'vitest'

import { spawn } from '../src/shell/process'

describe('shell process helper', () => {
  it('returns stdout on successful execution', async () => {
    const result = await spawn('node', ['-e', 'process.stdout.write("ok")'], {
      timeout: 5000,
    })

    expect(result.exitCode).toBe(0)
    expect(result.timedOut).toBe(false)
    expect(result.chunks.toString('utf-8')).toContain('ok')
  })

  it('rejects when process times out', async () => {
    await expect(spawn('node', ['-e', 'setTimeout(() => {}, 2000)'], {
      timeout: 100,
    })).rejects.toThrow('Process timed out')
  })

  it('rejects when aborted before start', async () => {
    const controller = new AbortController()
    controller.abort()

    await expect(spawn('node', ['-e', 'process.stdout.write("x")'], {
      timeout: 1000,
      signal: controller.signal,
    })).rejects.toThrow('Process execution aborted before start')
  })
})
