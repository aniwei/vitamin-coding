import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { createFind } from '../src/search/find'
import { createGrep } from '../src/search/grep'
import { createLs } from '../src/search/ls'

let root = ''
const signal = new AbortController().signal

async function setup(): Promise<string> {
  root = await mkdtemp(join(tmpdir(), 'vitamin-tools-search-extra-'))
  return root
}

afterEach(async () => {
  if (root) {
    await rm(root, { recursive: true, force: true })
    root = ''
  }
})

describe('search tools additional coverage', () => {
  it('ls returns informative message for empty directory', async () => {
    const dir = await setup()
    const tool = createLs(dir)

    const result = await tool.execute({
      id: 'ls-empty',
      params: { path: '.', limit: 200 },
      signal,
    })

    const text = result.content[0]?.type === 'text' ? result.content[0].text : ''
    expect(result.isError).toBeUndefined()
    expect(text).toContain('Directory is empty.')
  })

  it('find throws when neither glob nor fd executor is available', async () => {
    const dir = await setup()
    const tool = createFind(dir, {})

    await expect(tool.execute({
      id: 'find-no-exec',
      params: { pattern: '*.ts', limit: 100 },
      signal,
    })).rejects.toThrow('Find tool requires a glob implementation or fd binary available')
  })

  it('find uses binary executor output and preserves directory suffix', async () => {
    const dir = await setup()
    await mkdir(join(dir, 'src'), { recursive: true })
    await writeFile(join(dir, 'src', 'a.ts'), 'export {}')
    await writeFile(join(dir, '.gitignore'), 'node_modules\n')

    const fakeFd = {
      execute: async () => ({
        stdout: `${join(dir, 'src', 'a.ts')}\n${join(dir, 'src')}\/\n`,
        stderr: '',
        exitCode: 0,
      }),
    }

    const tool = createFind(dir, {
      binaryExecutorRegistry: {
        ensure: async () => fakeFd,
      } as never,
    })

    const result = await tool.execute({
      id: 'find-fd',
      params: { pattern: '*.ts', limit: 100 },
      signal,
    })

    const text = result.content[0]?.type === 'text' ? result.content[0].text : ''
    expect(text).toContain('src/a.ts')
    expect(text).toContain('src/')
  })

  it('grep throws when binary tool executor registry is not available', async () => {
    const dir = await setup()
    await writeFile(join(dir, 'a.txt'), 'hello')

    const tool = createGrep(dir, {})

    await expect(tool.execute({
      id: 'grep-no-registry',
      params: { pattern: 'hello' },
      signal,
    })).rejects.toThrow('Binary tool executor registry is not available')
  })

  it('grep throws when rg executor is not registered', async () => {
    const dir = await setup()
    await writeFile(join(dir, 'a.txt'), 'hello')

    const { BinaryToolExecutorRegistry } = await import('../src/binary/binary-executor-registry')
    const emptyRegistry = new BinaryToolExecutorRegistry()

    const tool = createGrep(dir, {
      binaryToolExecutorRegistry: emptyRegistry,
    })

    await expect(tool.execute({
      id: 'grep-no-rg',
      params: { pattern: 'hello' },
      signal,
    })).rejects.toThrow('ripgrep (rg) executor is not available')
  })

  it('grep throws for non-existent search path', async () => {
    const dir = await setup()

    const { BinaryToolExecutorRegistry } = await import('../src/binary/binary-executor-registry')
    const registry = new BinaryToolExecutorRegistry()

    const tool = createGrep(dir, {
      binaryToolExecutorRegistry: registry,
    })

    await expect(tool.execute({
      id: 'grep-no-path',
      params: { pattern: 'hello', path: 'nonexistent' },
      signal,
    })).rejects.toThrow()
  })
})
