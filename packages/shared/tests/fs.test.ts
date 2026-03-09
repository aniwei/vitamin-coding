import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  isDirectory,
  isFile,
  mkdirp,
  exists,
  readText,
  rimraf,
  writeText,
} from '../src/fs'

describe('fs utilities', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'vitamin-test-'))
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  describe('readText', () => {
    describe('#given a file that exists', () => {
      it('#then returns its content', async () => {
        const filePath = join(tempDir, 'test.txt')
        await writeText(filePath, 'hello')
        const content = await readText(filePath)
        expect(content).toBe('hello')
      })
    })

    describe('#given a file that does not exist', () => {
      it('#then returns undefined', async () => {
        const content = await readText(join(tempDir, 'nonexistent.txt'))
        expect(content).toBeUndefined()
      })
    })
  })

  describe('writeText', () => {
    describe('#given a nested path', () => {
      it('#then creates parent directories', async () => {
        const filePath = join(tempDir, 'a', 'b', 'c.txt')
        await writeText(filePath, 'deep')
        const content = await readText(filePath)
        expect(content).toBe('deep')
      })
    })
  })

  describe('mkdirp', () => {
    describe('#given a nested directory path', () => {
      it('#then creates all directories', async () => {
        const dirPath = join(tempDir, 'x', 'y', 'z')
        await mkdirp(dirPath)
        expect(await isDirectory(dirPath)).toBe(true)
      })
    })
  })

  describe('rimraf', () => {
    describe('#given a directory tree', () => {
      it('#then removes it entirely', async () => {
        const dirPath = join(tempDir, 'to-remove')
        await mkdirp(join(dirPath, 'sub'))
        await writeText(join(dirPath, 'sub', 'file.txt'), 'data')
        await rimraf(dirPath)
        expect(await exists(dirPath)).toBe(false)
      })
    })

    describe('#given a nonexistent path', () => {
      it('#then does not throw', async () => {
        await expect(rimraf(join(tempDir, 'nope'))).resolves.toBeUndefined()
      })
    })
  })

  describe('exists', () => {
    describe('#given an existing path', () => {
      it('#then returns true', async () => {
        expect(await exists(tempDir)).toBe(true)
      })
    })

    describe('#given a nonexistent path', () => {
      it('#then returns false', async () => {
        expect(await exists(join(tempDir, 'nope'))).toBe(false)
      })
    })
  })

  describe('isDirectory', () => {
    describe('#given a directory', () => {
      it('#then returns true', async () => {
        expect(await isDirectory(tempDir)).toBe(true)
      })
    })

    describe('#given a file', () => {
      it('#then returns false', async () => {
        const filePath = join(tempDir, 'file.txt')
        await writeText(filePath, 'data')
        expect(await isDirectory(filePath)).toBe(false)
      })
    })
  })

  describe('isFile', () => {
    describe('#given a file', () => {
      it('#then returns true', async () => {
        const filePath = join(tempDir, 'file.txt')
        await writeText(filePath, 'data')
        expect(await isFile(filePath)).toBe(true)
      })
    })

    describe('#given a directory', () => {
      it('#then returns false', async () => {
        expect(await isFile(tempDir)).toBe(false)
      })
    })
  })
})
