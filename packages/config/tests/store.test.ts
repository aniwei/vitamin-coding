import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { InMemoryConfigStore } from '../src/memory-store'
import { LocalConfigStore } from '../src/local-store'
import { createConfigStore } from '../src/store'
import { loadConfig } from '../src/loader'

// ─── InMemoryConfigStore ───

describe('InMemoryConfigStore', () => {
  it('reads and writes config', async () => {
    const store = new InMemoryConfigStore()

    expect(await store.read('test')).toBeUndefined()
    expect(await store.exists('test')).toBe(false)

    await store.write('test', { log_level: 'debug' })

    expect(await store.exists('test')).toBe(true)
    const content = await store.read('test')
    expect(content).toBeDefined()
    expect(JSON.parse(content!).log_level).toBe('debug')
  })

  it('accepts initial data', async () => {
    const store = new InMemoryConfigStore({
      '/path/a': '{ "model": "gpt-4o" }',
    })

    expect(await store.exists('/path/a')).toBe(true)
    expect(await store.read('/path/a')).toBe('{ "model": "gpt-4o" }')
  })

  it('reports correct storage type', () => {
    const store = new InMemoryConfigStore()
    expect(store.type).toBe('memory')
  })
})

// ─── LocalConfigStore ───

describe('LocalConfigStore', () => {
  let tempDir: string

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true })
    }
  })

  it('reads a JSONC file from disk', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'vitamin-cfg-'))
    const filePath = join(tempDir, 'config.jsonc')

    const { writeFile } = await import('node:fs/promises')
    await writeFile(filePath, '{ "log_level": "warn" /* comment */ }', 'utf-8')

    const store = new LocalConfigStore()
    const content = await store.read(filePath)

    expect(content).toBeDefined()
    expect(content).toContain('log_level')
  })

  it('returns undefined for non-existent file', async () => {
    const store = new LocalConfigStore()
    const content = await store.read('/tmp/does-not-exist-vitamin-test-' + Date.now())
    expect(content).toBeUndefined()
  })

  it('writes config and creates directories', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'vitamin-cfg-'))
    const filePath = join(tempDir, 'sub', 'dir', 'config.json')

    const store = new LocalConfigStore()
    await store.write(filePath, { log_level: 'error' })

    const written = await readFile(filePath, 'utf-8')
    expect(JSON.parse(written).log_level).toBe('error')
  })

  it('checks file existence', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'vitamin-cfg-'))
    const filePath = join(tempDir, 'config.json')

    const store = new LocalConfigStore()
    expect(await store.exists(filePath)).toBe(false)

    const { writeFile } = await import('node:fs/promises')
    await writeFile(filePath, '{}', 'utf-8')
    expect(await store.exists(filePath)).toBe(true)
  })

  it('reports correct storage type', () => {
    const store = new LocalConfigStore()
    expect(store.type).toBe('local')
  })
})

// ─── createConfigStore factory ───

describe('createConfigStore', () => {
  it('creates memory store', () => {
    const store = createConfigStore({ type: 'memory' })
    expect(store.type).toBe('memory')
  })

  it('creates local store', () => {
    const store = createConfigStore({ type: 'local' })
    expect(store.type).toBe('local')
  })

  it('creates remote store', () => {
    const store = createConfigStore({
      type: 'remote',
      baseUrl: 'https://example.com',
    })
    expect(store.type).toBe('remote')
  })
})

// ─── loadConfig + ConfigStore integration ───

describe('loadConfig with store', () => {
  it('loads config from in-memory store via configPaths', async () => {
    const store = new InMemoryConfigStore({
      '/user/config.jsonc': '{ "model": "user-model", "theme": "dark" }',
      '/project/config.jsonc': '{ "model": "project-model" }',
    })

    const config = await loadConfig({
      store,
      configPaths: ['/user/config.jsonc', '/project/config.jsonc'],
    })

    // project layer (index 1) overrides user layer (index 0)
    expect(config.model).toBe('project-model')
    // user layer provides theme
    expect(config.theme).toBe('dark')
  })

  it('skips missing config paths gracefully', async () => {
    const store = new InMemoryConfigStore({
      '/exists.jsonc': '{ "model": "found" }',
    })

    const config = await loadConfig({
      store,
      configPaths: ['/not-here.jsonc', '/exists.jsonc'],
    })

    expect(config.model).toBe('found')
  })

  it('overrides still win over file layers', async () => {
    const store = new InMemoryConfigStore({
      '/cfg.jsonc': '{ "model": "file-model" }',
    })

    const config = await loadConfig({
      store,
      configPaths: ['/cfg.jsonc'],
      overrides: { model: 'cli-model' },
    })

    expect(config.model).toBe('cli-model')
  })

  it('file layers override extensionDefaults', async () => {
    const store = new InMemoryConfigStore({
      '/cfg.jsonc': '{ "theme": "dark" }',
    })

    const config = await loadConfig({
      store,
      configPaths: ['/cfg.jsonc'],
      extensionDefaults: { theme: 'light', model: 'ext-model' },
    })

    expect(config.theme).toBe('dark')
    expect(config.model).toBe('ext-model')
  })

  it('works without store (backward-compatible)', async () => {
    const config = await loadConfig({
      overrides: { model: 'direct' },
    })

    expect(config.model).toBe('direct')
    expect(config.log_level).toBe('info')
  })

  it('skips invalid JSONC content without crashing', async () => {
    const store = new InMemoryConfigStore({
      '/bad.jsonc': '{ not valid json at all',
      '/good.jsonc': '{ "model": "good-model" }',
    })

    const config = await loadConfig({
      store,
      configPaths: ['/bad.jsonc', '/good.jsonc'],
    })

    expect(config.model).toBe('good-model')
  })
})
