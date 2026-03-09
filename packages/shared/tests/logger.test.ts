import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { createLogger, getRootLogger } from '../src/logger'

const LOG_FILE = '/tmp/vitamin.log'

describe('createLogger', () => {
  describe('#given a name', () => {
    it('#then returns a pino logger with the name', () => {
      const log = createLogger('test:module')
      expect(log).toBeDefined()
      expect(typeof log.info).toBe('function')
      expect(typeof log.error).toBe('function')
      expect(typeof log.debug).toBe('function')
      expect(typeof log.warn).toBe('function')
    })
  })

  describe('#given log output to file', () => {
    it('#then writes JSON Lines to /tmp/vitamin.log', async () => {
      const log = createLogger('test:file-output')
      const batch = `test-batch-${Date.now()}`
      for (let index = 0; index < 10; index++) {
        log.info({ batch, index }, 'logger file output test')
      }

      // pino transport 是异步的，需要等待刷新
      // 使用重试机制避免 transport 延迟导致的假失败
      let matchedLines: string[] = []
      for (let attempt = 0; attempt < 10; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 100))
        try {
          const content = await readFile(LOG_FILE, 'utf-8')
          matchedLines = content
            .trim()
            .split('\n')
            .filter((line) => line.includes(batch))
          if (matchedLines.length >= 10) break
        } catch {
          // 文件可能尚未被 transport 创建
        }
      }

      expect(matchedLines.length).toBeGreaterThanOrEqual(10)
      for (const line of matchedLines.slice(0, 10)) {
        const parsed = JSON.parse(line)
        expect(parsed.batch).toBe(batch)
        expect(parsed.msg).toBe('logger file output test')
        expect(parsed.name).toBe('test:file-output')
      }
    })
  })
})

describe('getRootLogger', () => {
  describe('#given no arguments', () => {
    it('#then returns the root pino instance', () => {
      const root = getRootLogger()
      expect(root).toBeDefined()
      expect(typeof root.info).toBe('function')
    })
  })
})
