import { describe, expect, it } from 'vitest'
import { spawnProcess } from '../src/process'

describe('spawnProcess', () => {
  describe('#given a simple echo command', () => {
    it('#then captures stdout', async () => {
      const result = await spawnProcess({
        command: 'echo',
        args: ['hello world'],
      })
      expect(result.stdout.trim()).toBe('hello world')
      expect(result.exitCode).toBe(0)
      expect(result.timedOut).toBe(false)
      expect(result.truncated).toBe(false)
    })
  })

  describe('#given a command that writes to stderr', () => {
    it('#then captures stderr', async () => {
      const result = await spawnProcess({
        command: 'sh',
        args: ['-c', 'echo error >&2'],
      })
      expect(result.stderr.trim()).toBe('error')
    })
  })

  describe('#given a command with non-zero exit code', () => {
    it('#then reports the exit code', async () => {
      const result = await spawnProcess({
        command: 'sh',
        args: ['-c', 'exit 42'],
      })
      expect(result.exitCode).toBe(42)
    })
  })

  describe('#given a command that exceeds timeout', () => {
    it('#then kills and reports timedOut', async () => {
      const result = await spawnProcess({
        command: 'sleep',
        args: ['10'],
        timeout: 100,
      })
      expect(result.timedOut).toBe(true)
    })
  })

  describe('#given output exceeding maxOutputSize', () => {
    it('#then truncates and reports truncated', async () => {
      const result = await spawnProcess({
        command: 'sh',
        args: ['-c', 'dd if=/dev/zero bs=1024 count=100 2>/dev/null | tr "\\0" "a"'],
        maxOutputSize: 1024,
      })
      expect(result.stdout.length).toBeLessThanOrEqual(1024)
      expect(result.truncated).toBe(true)
    })
  })

  describe('#given an AbortSignal', () => {
    it('#then kills the process on abort', async () => {
      const controller = new AbortController()
      const promise = spawnProcess({
        command: 'sleep',
        args: ['10'],
        signal: controller.signal,
        timeout: 30_000,
      })
      setTimeout(() => controller.abort(), 100)
      const result = await promise
      expect(result.signal).toBeDefined()
    })
  })

  describe('#given a cwd option', () => {
    it('#then runs in the specified directory', async () => {
      const result = await spawnProcess({
        command: 'pwd',
        cwd: '/tmp',
      })
      expect(result.stdout.trim()).toBe('/private/tmp')
    })
  })
})
