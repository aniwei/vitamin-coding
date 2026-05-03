import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { writeFile } from 'node:fs/promises'
import { stat } from 'node:fs/promises'
import { isDirectory, isFile, mkdirp, exists, rimraf } from '../src/fs-extra'

describe('fs utilities', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'x-mars-test-'))
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
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
        await writeFile(join(dirPath, 'sub', 'file.txt'), 'data', 'utf8')
        await rimraf(dirPath)
        await expect(stat(dirPath)).rejects.toThrow()
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
      it('#then throws ENOENT', async () => {
        await expect(exists(join(tempDir, 'nope'))).rejects.toThrow()
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
        await writeFile(filePath, 'data', 'utf8')
        expect(await isDirectory(filePath)).toBe(false)
      })
    })
  })

  describe('isFile', () => {
    describe('#given a file', () => {
      it('#then returns true', async () => {
        const filePath = join(tempDir, 'file.txt')
        await writeFile(filePath, 'data', 'utf8')
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
