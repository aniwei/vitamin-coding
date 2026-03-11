import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { createBashTool } from '../src/builtin/bash'
import { createEditTool } from '../src/builtin/edit'
import { createReadTool } from '../src/builtin/read'
import { createWriteTool } from '../src/builtin/write'

let workspaceDir = ''

async function createWorkspace(): Promise<string> {
  workspaceDir = await mkdtemp(join(tmpdir(), 'vitamin-tools-'))
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
        const writeTool = createWriteTool(root)

        const result = await writeTool.execute(
          'w1',
          {
            path: 'a/b/c.txt',
            content: 'hello\nworld',
          },
          new AbortController().signal,
        )

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
        const writeTool = createWriteTool(root)
        const readTool = createReadTool(root)

        await writeTool.execute(
          'w2',
          {
            path: 'note.txt',
            content: 'line1\nline2\nline3\nline4',
          },
          new AbortController().signal,
        )

        const result = await readTool.execute(
          'r1',
          {
            path: 'note.txt',
            startLine: 2,
            endLine: 3,
          },
          new AbortController().signal,
        )

        const text = result.content[0]?.text ?? ''
        expect(result.isError).toBeUndefined()
        expect(text).toContain('2 | line2')
        expect(text).toContain('3 | line3')
        expect(text).not.toContain('1 | line1')
      })
    })
  })

  describe('#given edit tool uniqueness constraints', () => {
    describe('#when oldString appears multiple times', () => {
      it('#then returns an error without modifying file', async () => {
        const root = await createWorkspace()
        const writeTool = createWriteTool(root)
        const editTool = createEditTool(root)

        await writeTool.execute(
          'w3',
          {
            path: 'dup.txt',
            content: 'foo\nfoo\nbar',
          },
          new AbortController().signal,
        )

        const result = await editTool.execute(
          'e1',
          {
            path: 'dup.txt',
            oldString: 'foo',
            newString: 'baz',
          },
          new AbortController().signal,
        )

        const content = await readFile(join(root, 'dup.txt'), 'utf-8')
        expect(result.isError).toBe(true)
        expect(result.content[0]?.text).toContain('found 2 times')
        expect(content).toBe('foo\nfoo\nbar')
      })
    })
  })

  describe('#given bash tool execution', () => {
    describe('#when command output exceeds 60KB', () => {
      it('#then truncates output to bounded size', async () => {
        const root = await createWorkspace()
        const bashTool = createBashTool(root)

        const result = await bashTool.execute(
          'b1',
          {
            command: 'node -e "process.stdout.write(\'a\'.repeat(70000))"',
          },
          new AbortController().signal,
        )

        const text = result.content[0]?.text ?? ''
        expect(result.isError).toBe(false)
        expect(text.length).toBeLessThanOrEqual(60 * 1024)
        expect(text.length).toBeGreaterThan(50 * 1024)
      })
    })

    describe('#when command exceeds timeout', () => {
      it('#then returns command failure result', async () => {
        const root = await createWorkspace()
        const bashTool = createBashTool(root)

        const result = await bashTool.execute(
          'b2',
          {
            command: 'sleep 2',
            timeout: 1000,
          },
          new AbortController().signal,
        )

        expect(result.isError).toBe(true)
        expect(result.content[0]?.text).toContain('Command exited with code')
      })
    })
  })
})
