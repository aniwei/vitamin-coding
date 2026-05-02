import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { FileStateManager } from '../src/file-state-snapshot'

describe('FileStateManager', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'x-mars-file-state-'))
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  it('#then captures and restores file contents for recent files', async () => {
    await mkdir(join(tempDir, 'src'), { recursive: true })
    await writeFile(join(tempDir, 'src/app.ts'), 'before', 'utf-8')

    const manager = new FileStateManager()
    const snapshot = await manager.capture({
      workspaceDir: tempDir,
      recentFiles: ['src/app.ts', 'src/new.ts'],
      captureFileContents: true,
    })

    await writeFile(join(tempDir, 'src/app.ts'), 'after', 'utf-8')
    await writeFile(join(tempDir, 'src/new.ts'), 'created', 'utf-8')

    const restored = await manager.restoreFileContents(tempDir, snapshot)

    expect(restored).toEqual(['src/app.ts', 'src/new.ts'])
    expect(await readFile(join(tempDir, 'src/app.ts'), 'utf-8')).toBe('before')
    await expect(readFile(join(tempDir, 'src/new.ts'), 'utf-8')).rejects.toThrow()
  })

  it('#then ignores file paths outside the workspace', async () => {
    const manager = new FileStateManager()
    const snapshot = await manager.capture({
      workspaceDir: tempDir,
      recentFiles: ['../outside.ts'],
      captureFileContents: true,
    })

    expect(snapshot.fileContents).toEqual([])
  })

  it('#then records truncated content when file exceeds capture limit', async () => {
    await writeFile(join(tempDir, 'large.txt'), 'abcdef', 'utf-8')

    const manager = new FileStateManager()
    const snapshot = await manager.capture({
      workspaceDir: tempDir,
      recentFiles: ['large.txt'],
      captureFileContents: true,
      maxFileContentBytes: 3,
    })

    expect(snapshot.fileContents?.[0]).toMatchObject({
      path: 'large.txt',
      existed: true,
      content: 'abc',
      sizeBytes: 6,
      truncated: true,
    })
  })
})
