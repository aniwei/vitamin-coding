import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { LSPClient, lspManager, validateCwd } from '../src/lsp/lsp-client'
import { findWorkspaceRoot } from '../src/lsp/lsp-wrapper'
import { isServerInstalled } from '../src/lsp/server-config'
import type { ResolvedServer } from '../src/lsp/types'

describe('LSP', () => {
  // ─── validateCwd ──────────────────────────────────────────────────────

  describe('validateCwd', () => {
    it('returns valid for existing directory', () => {
      const dir = mkdtempSync(join(tmpdir(), 'lsp-cwd-test-'))
      try {
        const result = validateCwd(dir)
        expect(result.valid).toBe(true)
        expect(result.error).toBeUndefined()
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    })

    it('returns invalid for non-existent directory', () => {
      const nonExistentDir = join(tmpdir(), 'lsp-cwd-nonexistent-' + Date.now())
      const result = validateCwd(nonExistentDir)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('Working directory does not exist')
    })

    it('returns invalid when path is a file', () => {
      const dir = mkdtempSync(join(tmpdir(), 'lsp-cwd-file-test-'))
      const filePath = join(dir, 'not-a-dir.txt')
      writeFileSync(filePath, 'test content')
      try {
        const result = validateCwd(filePath)
        expect(result.valid).toBe(false)
        expect(result.error).toContain('Path is not a directory')
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    })
  })

  // ─── LSPClient.start ─────────────────────────────────────────────────

  describe('LSPClient.start', () => {
    it('throws error when working directory does not exist', async () => {
      const nonExistentDir = join(tmpdir(), 'lsp-test-nonexistent-' + Date.now())
      const server: ResolvedServer = {
        id: 'typescript',
        command: ['typescript-language-server', '--stdio'],
        extensions: ['.ts'],
        priority: 0,
      }
      const client = new LSPClient(nonExistentDir, server)
      await expect(client.start()).rejects.toThrow('Working directory does not exist')
    })

    it('throws error when path is a file instead of directory', async () => {
      const dir = mkdtempSync(join(tmpdir(), 'lsp-client-test-'))
      const filePath = join(dir, 'not-a-dir.txt')
      writeFileSync(filePath, 'test content')
      const server: ResolvedServer = {
        id: 'typescript',
        command: ['typescript-language-server', '--stdio'],
        extensions: ['.ts'],
        priority: 0,
      }
      const client = new LSPClient(filePath, server)
      try {
        await expect(client.start()).rejects.toThrow('Path is not a directory')
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    })
  })

  // ─── LSPServerManager ────────────────────────────────────────────────

  describe('LSPServerManager', () => {
    beforeEach(async () => {
      await lspManager.stopAll()
    })
    afterEach(async () => {
      await lspManager.stopAll()
    })

    it('recreates client after init failure instead of staying permanently blocked', async () => {
      const dir = mkdtempSync(join(tmpdir(), 'lsp-manager-test-'))
      const server: ResolvedServer = {
        id: 'typescript',
        command: ['typescript-language-server', '--stdio'],
        extensions: ['.ts'],
        priority: 0,
      }

      const startSpy = vi.spyOn(LSPClient.prototype, 'start')
      const initializeSpy = vi.spyOn(LSPClient.prototype, 'initialize')
      const isAliveSpy = vi.spyOn(LSPClient.prototype, 'isAlive')
      const stopSpy = vi.spyOn(LSPClient.prototype, 'stop')

      startSpy.mockImplementationOnce(async () => {
        throw new Error('boom')
      })
      startSpy.mockImplementation(async () => {})
      initializeSpy.mockImplementation(async () => {})
      isAliveSpy.mockImplementation(() => true)
      stopSpy.mockImplementation(async () => {})

      try {
        await expect(lspManager.getClient(dir, server)).rejects.toThrow('boom')
        const client = await lspManager.getClient(dir, server)
        expect(client).toBeInstanceOf(LSPClient)
        expect(startSpy).toHaveBeenCalledTimes(2)
        expect(stopSpy).toHaveBeenCalled()
      } finally {
        startSpy.mockRestore()
        initializeSpy.mockRestore()
        isAliveSpy.mockRestore()
        stopSpy.mockRestore()
        rmSync(dir, { recursive: true, force: true })
      }
    })
  })

  // ─── findWorkspaceRoot ────────────────────────────────────────────────

  describe('findWorkspaceRoot', () => {
    it('returns root when file path points to non-existent nested path', () => {
      const tmp = mkdtempSync(join(tmpdir(), 'lsp-root-'))
      try {
        writeFileSync(join(tmp, 'package.json'), '{}')
        const nonExistentFile = join(tmp, 'does-not-exist', 'deep', 'file.ts')
        const root = findWorkspaceRoot(nonExistentFile)
        expect(root).toBe(tmp)
      } finally {
        rmSync(tmp, { recursive: true, force: true })
      }
    })

    it('prefers nearest marker directory', () => {
      const tmp = mkdtempSync(join(tmpdir(), 'lsp-marker-'))
      try {
        const repo = join(tmp, 'repo')
        const src = join(repo, 'src')
        mkdirSync(src, { recursive: true })
        writeFileSync(join(repo, 'package.json'), '{}')
        const file = join(src, 'index.ts')
        writeFileSync(file, 'export {}')
        expect(findWorkspaceRoot(file)).toBe(repo)
      } finally {
        rmSync(tmp, { recursive: true, force: true })
      }
    })
  })

  // ─── isServerInstalled ────────────────────────────────────────────────

  describe('isServerInstalled', () => {
    let tempDir: string
    let savedPath: string | undefined

    beforeEach(() => {
      tempDir = mkdtempSync(join(tmpdir(), 'lsp-config-test-'))
      savedPath = process.env.PATH
    })

    afterEach(() => {
      try {
        rmSync(tempDir, { recursive: true, force: true })
      } catch {}
      if (savedPath === undefined) {
        delete process.env.PATH
      } else {
        process.env.PATH = savedPath
      }
    })

    it('detects executable in PATH', () => {
      const binName = 'test-lsp-server'
      const ext = process.platform === 'win32' ? '.cmd' : ''
      const binPath = join(tempDir, binName + ext)
      writeFileSync(binPath, 'echo hello')
      const pathSep = process.platform === 'win32' ? ';' : ':'
      process.env.PATH = `${tempDir}${pathSep}${process.env.PATH || ''}`
      expect(isServerInstalled([binName])).toBe(true)
    })

    it('returns false for missing executable', () => {
      expect(isServerInstalled(['non-existent-server'])).toBe(false)
    })

    it('returns false for empty command', () => {
      expect(isServerInstalled([])).toBe(false)
    })
  })
})
