import { mkdir, mkdtemp, rm, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { createRead } from '../src/fs/read'
import { createEdit } from '../src/fs/edit'
import { createFind } from '../src/search/find'

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

describe('read tool coverage branches', () => {
  it('throws for missing file', async () => {
    const root = await createWorkspace()
    const readTool = createRead(root)

    await expect(readTool.execute({
      id: 'r1',
      params: { path: 'missing.ts' },
      signal,
    })).rejects.toThrow('ENOENT')
  })

  it('throws for directory path', async () => {
    const root = await createWorkspace()
    await mkdir(join(root, 'subdir'))
    const readTool = createRead(root)

    await expect(readTool.execute({
      id: 'r2',
      params: { path: 'subdir' },
      signal,
    })).rejects.toThrow('Not a file')
  })

  it('returns image content for png', async () => {
    const root = await createWorkspace()
    const pngBuffer = Buffer.from(
      '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489' +
      '0000000a49444154789c626000000002000198e195280000000049454e44ae426082',
      'hex',
    )
    await writeFile(join(root, 'tiny.png'), pngBuffer)

    const readTool = createRead(root)
    const result = await readTool.execute({
      id: 'r3',
      params: { path: 'tiny.png' },
      signal,
    })

    expect(result.isError).toBeUndefined()
    expect(result.content[0]).toHaveProperty('type', 'text')
    expect(result.content[1]).toHaveProperty('type', 'image')
    const imageContent = result.content[1] as { source: string }
    expect(imageContent.source).toContain('data:image/png;base64,')
  })

  it('returns all text content without range', async () => {
    const root = await createWorkspace()
    await writeFile(join(root, 'all.txt'), 'AAA\nBBB\nCCC')

    const readTool = createRead(root)
    const result = await readTool.execute({
      id: 'r4',
      params: { path: 'all.txt' },
      signal,
    })

    expect(result.isError).toBeUndefined()
    const text = (result.content[0] as { text: string }).text
    expect(text).toContain('AAA')
    expect(text).toContain('BBB')
    expect(text).toContain('CCC')
  })
})

describe('edit tool coverage branches', () => {
  it('edits on successful single match', async () => {
    const root = await createWorkspace()
    await writeFile(join(root, 'target.ts'), 'const x = 1\nconst y = 2\n')
    const editTool = createEdit(root)

    const result = await editTool.execute({
      id: 'e1',
      params: {
        path: 'target.ts',
        oldContent: 'const x = 1',
        newContent: 'const x = 42',
      },
      signal,
    })

    expect(result.isError).toBeUndefined()
    expect(result.content[0]?.text).toContain('Successfully replaced text')
    const content = await readFile(join(root, 'target.ts'), 'utf-8')
    expect(content).toContain('const x = 42')
  })

  it('throws when file does not exist', async () => {
    const root = await createWorkspace()
    const editTool = createEdit(root)

    await expect(editTool.execute({
      id: 'e2',
      params: {
        path: 'missing.ts',
        oldContent: 'x',
        newContent: 'y',
      },
      signal,
    })).rejects.toThrow('ENOENT')
  })

  it('returns explanatory message when oldContent is missing', async () => {
    const root = await createWorkspace()
    await writeFile(join(root, 'a.ts'), 'hello world')
    const editTool = createEdit(root)

    const result = await editTool.execute({
      id: 'e3',
      params: {
        path: 'a.ts',
        oldContent: 'NOPE',
        newContent: 'y',
      },
      signal,
    })

    expect(result.isError).toBeUndefined()
    expect(result.content[0]?.text).toContain('Could not find the specified text')
  })
})

describe('find tool coverage branches', () => {
  it('returns matching files with injected glob', async () => {
    const root = await createWorkspace()
    await mkdir(join(root, 'src'), { recursive: true })
    await writeFile(join(root, 'src/a.ts'), '')
    await writeFile(join(root, 'src/b.ts'), '')

    const findTool = createFind(root, {
      glob: async () => [join(root, 'src/a.ts'), join(root, 'src/b.ts')],
    })

    const result = await findTool.execute({
      id: 'f1',
      params: {
        pattern: 'src/*.ts',
        limit: 100,
      },
      signal,
    })

    const text = (result.content[0] as { text: string }).text
    expect(result.isError).toBeUndefined()
    expect(text).toContain('src/a.ts')
    expect(text).toContain('src/b.ts')
  })

  it('throws when no files match with injected glob', async () => {
    const root = await createWorkspace()
    const findTool = createFind(root, {
      glob: async () => [],
    })

    await expect(findTool.execute({
      id: 'f2',
      params: {
        pattern: '**/*.xyz',
      },
      signal,
    })).rejects.toThrow('No files found matching pattern')
  })
})
