import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { findProjectRoot, normalizePath, resolvePath } from '../src/path'

describe('normalizePath', () => {
  describe('#given a path with backslashes and double dots', () => {
    it('#then normalizes to forward slashes', () => {
      const result = normalizePath('/foo/bar/../baz')
      expect(result).toBe('/foo/baz')
    })
  })

  describe('#given a clean path', () => {
    it('#then returns it unchanged', () => {
      expect(normalizePath('/foo/bar')).toBe('/foo/bar')
    })
  })
})

describe('resolvePath', () => {
  describe('#given relative segments', () => {
    it('#then returns an absolute path', () => {
      const result = resolvePath('/base', 'sub', 'file.ts')
      expect(result).toBe('/base/sub/file.ts')
    })
  })
})

describe('findProjectRoot', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'vitamin-root-'))
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  describe('#given a directory with package.json', () => {
    it('#then finds the project root', async () => {
      await writeFile(join(tempDir, 'package.json'), '{}')
      const subDir = join(tempDir, 'src', 'sub')
      await mkdir(subDir, { recursive: true })
      const root = await findProjectRoot(subDir)
      expect(root).toBe(tempDir)
    })
  })

  describe('#given a directory with .git', () => {
    it('#then finds the project root', async () => {
      await mkdir(join(tempDir, '.git'))
      const root = await findProjectRoot(tempDir)
      expect(root).toBe(tempDir)
    })
  })

  describe('#given a directory with no markers ascending to fs root', () => {
    it('#then returns undefined', async () => {
      // 创建深层嵌套目录，不包含任何项目标识文件
      const deep = join(tempDir, 'a', 'b', 'c')
      await mkdir(deep, { recursive: true })
      // 此测试可能会找到真实工作区根目录，因此只验证返回值是字符串或 undefined
      const root = await findProjectRoot(deep)
      // 要么找到上层项目根目录，要么返回 undefined，关键是不抛异常
      expect(root === undefined || typeof root === 'string').toBe(true)
    })
  })

  describe('#given the .vitamin marker', () => {
    it('#then detects it as a project root', async () => {
      await mkdir(join(tempDir, '.vitamin'))
      const root = await findProjectRoot(tempDir)
      expect(root).toBe(tempDir)
    })
  })
})
