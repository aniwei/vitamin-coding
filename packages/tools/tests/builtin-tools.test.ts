import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { createBash } from '../src/shell/bash'
import { createEdit } from '../src/fs/edit'
import { createRead } from '../src/fs/read'
import { createWrite } from '../src/fs/write'

let workspaceDir = ''

async function createWorkspace(): Promise<string> {
  workspaceDir = await mkdtemp(join(tmpdir(), 'x-mars-tools-'))
  return workspaceDir
}

afterEach(async () => {
  if (workspaceDir) {
    await rm(workspaceDir, { recursive: true, force: true })
    workspaceDir = ''
  }
})

describe('builtin tools', () => {
  describe('#given write tool with nested path', () => {
    describe('#when writing content to non-existing directory', () => {
      it('#then creates directories and writes file', async () => {
        const root = await createWorkspace()
        const writeTool = createWrite(root)

        const result = await writeTool.execute({
          id: 'w1',
          params: {
            path: 'a/b/c.txt',
            content: 'hello\nworld',
          },
          signal: new AbortController().signal,
        })

        const saved = await readFile(join(root, 'a/b/c.txt'), 'utf-8')

        expect(result.isError).toBeUndefined()
        expect(saved).toBe('hello\nworld')
        expect(result.content[0]?.text).toContain('Successfully wrote')
      })
    })
  })

  describe('#given read tool with line range', () => {
    describe('#when reading an existing file', () => {
      it('#then returns numbered selected lines', async () => {
        const root = await createWorkspace()
        const writeTool = createWrite(root)
        const readTool = createRead(root)

        await writeTool.execute({
          id: 'w2',
          params: {
            path: 'note.txt',
            content: 'line1\nline2\nline3\nline4',
          },
          signal: new AbortController().signal,
        })

        const result = await readTool.execute({
          id: 'r1',
          params: {
            path: 'note.txt',
            offset: 2,
            limit: 2,
          },
          signal: new AbortController().signal,
        })

        const text = result.content[0]?.text ?? ''
        expect(result.isError).toBeUndefined()
        expect(text).toContain('line2')
        expect(text).toContain('line3')
        expect(text).not.toContain('line1')
      })
    })
  })

  describe('#given edit tool uniqueness constraints', () => {
    describe('#when oldString appears multiple times', () => {
      it('#then returns an error without modifying file', async () => {
        const root = await createWorkspace()
        const writeTool = createWrite(root)
        const editTool = createEdit(root)

        await writeTool.execute({
          id: 'w3',
          params: {
            path: 'dup.txt',
            content: 'foo\nfoo\nbar',
          },
          signal: new AbortController().signal,
        })

        const result = await editTool.execute({
          id: 'e1',
          params: {
            path: 'dup.txt',
            oldContent: 'foo',
            newContent: 'baz',
          },
          signal: new AbortController().signal,
        })

        const content = await readFile(join(root, 'dup.txt'), 'utf-8')
        expect(result.isError).toBeUndefined()
        expect(result.content[0]?.text).toContain('Found 2 occurrences')
        expect(content).toBe('foo\nfoo\nbar')
      })
    })
  })

  describe('#given bash tool execution', () => {
    describe('#when command output exceeds 60KB', () => {
      it('#then truncates output to bounded size', async () => {
        const root = await createWorkspace()
        const bashTool = createBash(root)

        const result = await bashTool.execute({
          id: 'b1',
          params: {
            command: 'node -e "process.stdout.write(\'a\'.repeat(70000))"',
          },
          signal: new AbortController().signal,
        })

        const text = result.content[0]?.text ?? ''
        expect(result.isError).toBeUndefined()
        expect(text.length).toBeLessThanOrEqual(64 * 1024)
        expect(text.length).toBeGreaterThan(50 * 1024)
      })
    })

    describe('#when command exceeds timeout', () => {
      it('#then returns command failure result', async () => {
        const root = await createWorkspace()
        const bashTool = createBash(root)

        await expect(bashTool.execute({
          id: 'b2',
          params: {
            command: 'sleep 2',
            timeout: 1000,
          },
          signal: new AbortController().signal,
        })).rejects.toThrow('Process timed out')
      })
    })
  })
})
