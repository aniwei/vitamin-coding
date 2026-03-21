// 面向覆盖率的 builtin tools 补充测试（read/edit/glob/ast-grep）
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readFile } from 'node:fs/promises'
import { afterEach, describe, expect, it } from 'vitest'

import { createRead } from '../src/fs/read'
import { createEdit } from '../src/fs/edit'
import { createGlob } from '../src/search/glob'

let workspaceDir = ''

async function createWorkspace(): Promise<string> {
  workspaceDir = await mkdtemp(join(tmpdir(), 'vitamin-tools-cov-'))
  return workspaceDir
}

afterEach(async () => {
  if (workspaceDir) {
    await rm(workspaceDir, { recursive: true, force: true })
    workspaceDir = ''
  }
})

const signal = new AbortController().signal

// ═══ read tool 覆盖率补充 ═══

describe('read tool — coverage branches', () => {
  describe('#given file not found', () => {
    describe('#when read is called', () => {
      it('#then returns isError with message', async () => {
        const root = await createWorkspace()
        const readTool = createRead(root)

        const result = await readTool.execute({ id: 'r1', args: { path: 'nonexistent.ts' }, signal })
        expect(result.isError).toBe(true)
        expect(result.content[0]?.text).toContain('File not found')
      })
    })
  })

  describe('#given a directory instead of file', () => {
    describe('#when read is called', () => {
      it('#then returns isError with not-a-file message', async () => {
        const root = await createWorkspace()
        await mkdir(join(root, 'subdir'))
        const readTool = createRead(root)

        const result = await readTool.execute({ id: 'r2', args: { path: 'subdir' }, signal })
        expect(result.isError).toBe(true)
        expect(result.content[0]?.text).toContain('Not a file')
      })
    })
  })

  describe('#given an image file (png)', () => {
    describe('#when read is called', () => {
      it('#then returns image content with base64', async () => {
        const root = await createWorkspace()
        // 制造一个最小 PNG 文件 (1x1 transparent pixel)
        const pngBuffer = Buffer.from(
          '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489' +
          '0000000a49444154789c626000000002000198e195280000000049454e44ae426082',
          'hex',
        )
        await writeFile(join(root, 'tiny.png'), pngBuffer)
        const readTool = createRead(root)

        const result = await readTool.execute({ id: 'r3', args: { path: 'tiny.png' }, signal })
        expect(result.isError).toBeUndefined()
        const content = result.content[0] as { type: string; source?: { type: string; mediaType: string } }
        expect(content.type).toBe('image')
        expect(content.source?.mediaType).toBe('image/png')
      })
    })
  })

  describe('#given an SVG file', () => {
    describe('#when read is called', () => {
      it('#then returns text content', async () => {
        const root = await createWorkspace()
        await writeFile(join(root, 'icon.svg'), '<svg><circle/></svg>')
        const readTool = createRead(root)

        const result = await readTool.execute({ id: 'r-svg', args: { path: 'icon.svg' }, signal })
        expect(result.isError).toBeUndefined()
        expect(result.content[0]).toHaveProperty('type', 'text')
        expect((result.content[0] as { text: string }).text).toContain('<svg>')
      })
    })
  })

  describe('#given a JPEG file', () => {
    describe('#when read is called', () => {
      it('#then returns image with jpeg media type', async () => {
        const root = await createWorkspace()
        // 最小 JPEG header
        const jpegBuffer = Buffer.from('ffd8ffe000104a46494600', 'hex')
        await writeFile(join(root, 'photo.jpg'), jpegBuffer)
        const readTool = createRead(root)

        const result = await readTool.execute({ id: 'r-jpg', args: { path: 'photo.jpg' }, signal })
        expect(result.isError).toBeUndefined()
        const content = result.content[0] as { type: string; source?: { type: string; mediaType: string } }
        expect(content.type).toBe('image')
        expect(content.source?.mediaType).toBe('image/jpeg')
      })
    })
  })

  describe('#given read with no line range', () => {
    describe('#when called on a text file', () => {
      it('#then returns all lines with numbers', async () => {
        const root = await createWorkspace()
        await writeFile(join(root, 'all.txt'), 'AAA\nBBB\nCCC')
        const readTool = createRead(root)

        const result = await readTool.execute({ id: 'r-all', args: { path: 'all.txt' }, signal })
        expect(result.isError).toBeUndefined()
        const text = (result.content[0] as { text: string }).text
        expect(text).toContain('1 | AAA')
        expect(text).toContain('2 | BBB')
        expect(text).toContain('3 | CCC')
      })
    })
  })
})

// ═══ edit tool 覆盖率补充 ═══

describe('edit tool — coverage branches', () => {
  describe('#given successful single match', () => {
    describe('#when edit is applied', () => {
      it('#then replaces content and reports success', async () => {
        const root = await createWorkspace()
        await writeFile(join(root, 'target.ts'), 'const x = 1\nconst y = 2\n')
        const editTool = createEdit(root)

        const result = await editTool.execute({ id: 'e1', args: {
          path: 'target.ts',
          oldString: 'const x = 1',
          newString: 'const x = 42',
        }, signal })

        expect(result.isError).toBeUndefined()
        expect(result.content[0]?.text).toContain('Successfully edited')
        const content = await readFile(join(root, 'target.ts'), 'utf-8')
        expect(content).toContain('const x = 42')
      })
    })
  })

  describe('#given file not found', () => {
    describe('#when edit is called', () => {
      it('#then returns isError', async () => {
        const root = await createWorkspace()
        const editTool = createEdit(root)

        const result = await editTool.execute({ id: 'e2', args: {
          path: 'missing.ts',
          oldString: 'x',
          newString: 'y',
        }, signal })

        expect(result.isError).toBe(true)
        expect(result.content[0]?.text).toContain('File not found')
      })
    })
  })

  describe('#given edit on a directory', () => {
    describe('#when called', () => {
      it('#then returns not-a-file error', async () => {
        const root = await createWorkspace()
        await mkdir(join(root, 'mydir'))
        const editTool = createEdit(root)

        const result = await editTool.execute({ id: 'e3', args: {
          path: 'mydir',
          oldString: 'x',
          newString: 'y',
        }, signal })

        expect(result.isError).toBe(true)
        expect(result.content[0]?.text).toContain('Not a file')
      })
    })
  })

  describe('#given oldString not found', () => {
    describe('#when called', () => {
      it('#then returns not-found error', async () => {
        const root = await createWorkspace()
        await writeFile(join(root, 'a.ts'), 'hello world')
        const editTool = createEdit(root)

        const result = await editTool.execute({ id: 'e4', args: {
          path: 'a.ts',
          oldString: 'NOPE',
          newString: 'y',
        }, signal })

        expect(result.isError).toBe(true)
        expect(result.content[0]?.text).toContain('oldString not found')
      })
    })
  })

  describe('#given multi-line replacement', () => {
    describe('#when edited', () => {
      it('#then reports correct line counts', async () => {
        const root = await createWorkspace()
        await writeFile(join(root, 'ml.ts'), 'a\nb\nc\nd')
        const editTool = createEdit(root)

        const result = await editTool.execute({ id: 'e5', args: {
          path: 'ml.ts',
          oldString: 'b\nc',
          newString: 'B\nC\nC2',
        }, signal })

        expect(result.isError).toBeUndefined()
        expect(result.content[0]?.text).toContain('replaced 2 lines with 3 lines')
        const content = await readFile(join(root, 'ml.ts'), 'utf-8')
        expect(content).toBe('a\nB\nC\nC2\nd')
      })
    })
  })
})

// ═══ glob tool 覆盖率补充 ═══

describe('glob tool — coverage branches', () => {
  describe('#given files with nested structure', () => {
    describe('#when matching specific pattern', () => {
      it('#then returns matching files', async () => {
        const root = await createWorkspace()
        await mkdir(join(root, 'src'), { recursive: true })
        await writeFile(join(root, 'src/a.ts'), '')
        await writeFile(join(root, 'src/b.ts'), '')
        await writeFile(join(root, 'src/c.js'), '')

        const globTool = createGlob(root)
        const result = await globTool.execute({ id: 'g1', args: {
          pattern: 'src/*.ts',
        }, signal })

        expect(result.isError).toBeUndefined()
        const text = (result.content[0] as { text: string }).text
        expect(text).toContain('a.ts')
        expect(text).toContain('b.ts')
        expect(text).not.toContain('c.js')
      })
    })
  })

  describe('#given no matches', () => {
    describe('#when glob is executed', () => {
      it('#then returns no-match message', async () => {
        const root = await createWorkspace()

        const globTool = createGlob(root)
        const result = await globTool.execute({ id: 'g2', args: {
          pattern: '**/*.xyz',
        }, signal })

        const text = (result.content[0] as { text: string }).text
        expect(text).toContain('No files match pattern')
      })
    })
  })
})

