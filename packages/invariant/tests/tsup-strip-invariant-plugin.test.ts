import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { describe, expect, it } from 'vitest'

import { createStripInvariantInProductionPlugin } from '../src/tsup-strip-invariant-plugin'

type OnLoadArgs = { path: string }
type OnLoadResult = { contents: string; loader: 'ts' }

type OnLoadCallback = (args: OnLoadArgs) => Promise<OnLoadResult>

async function runPluginTransform(
  source: string,
  options?: { invariantImportSource?: string },
): Promise<string> {
  const tempRoot = await mkdtemp(join(tmpdir(), 'vitamin-invariant-'))
  const sourceDir = join(tempRoot, 'src')
  const targetFile = join(sourceDir, 'agent.ts')

  await mkdir(sourceDir, { recursive: true })
  await writeFile(targetFile, source, 'utf8')

  let onLoad: OnLoadCallback | undefined
  const plugin = createStripInvariantInProductionPlugin({
    filter: /\/src\/agent\.ts$/,
    invariantImportSource: options?.invariantImportSource,
  })

  plugin.setup({
    onLoad(_options, callback) {
      onLoad = callback
    },
  })

  if (!onLoad) {
    throw new Error('Plugin did not register onLoad callback')
  }

  const result = await onLoad({ path: targetFile })
  const transformed = result.contents

  await rm(tempRoot, { recursive: true, force: true })
  return transformed
}

describe('createStripInvariantInProductionPlugin', () => {
  it('strips invariant import and development invariant guard block', async () => {
    const source = `
import { invariant, setVerbosity } from '@vitamin/invariant'

if (process.env.NODE_ENV !== 'production') {
  invariant(() => true, 'dev check')
}

setVerbosity('warn')
`

    const output = await runPluginTransform(source)

    expect(output).not.toContain("invariant(() => true, 'dev check')")
    expect(output).not.toContain("if (process.env.NODE_ENV !== 'production')")
    expect(output).toContain("import { setVerbosity } from '@vitamin/invariant'")
    expect(output).toContain("setVerbosity('warn')")
  })

  it('keeps unrelated NODE_ENV development branch when no invariant call exists', async () => {
    const source = `
import { setVerbosity } from '@vitamin/invariant'

if (process.env.NODE_ENV !== 'production') {
  setVerbosity('debug')
}
`

    const output = await runPluginTransform(source)

    expect(output).toContain("if (process.env.NODE_ENV !== 'production')")
    expect(output).toContain("setVerbosity('debug')")
  })

  it('supports custom invariant import source', async () => {
    const source = `
import { invariant, keepMe } from '@custom/invariant'

if (process.env.NODE_ENV !== 'production') {
  invariant(true, 'drop me')
}

keepMe()
`

    const output = await runPluginTransform(source, {
      invariantImportSource: '@custom/invariant',
    })

    expect(output).not.toContain("invariant(true, 'drop me')")
    expect(output).toContain("import { keepMe } from '@custom/invariant'")
    expect(output).toContain('keepMe()')
  })

  it('strips invariant guard nested inside class method', async () => {
    const source = `
import { invariant } from '@vitamin/invariant'

class AgentLike {
  run() {
    if (process.env.NODE_ENV !== 'production') {
      invariant(() => true, 'nested dev check')
    }

    return 'ok'
  }
}
`

    const output = await runPluginTransform(source)

    expect(output).not.toContain("invariant(() => true, 'nested dev check')")
    expect(output).not.toContain("if (process.env.NODE_ENV !== 'production')")
    expect(output).toContain("return 'ok'")
  })

  it('strips guard when invariant is imported with alias', async () => {
    const source = `
import { invariant as inv, setVerbosity } from '@vitamin/invariant'

if (process.env.NODE_ENV !== 'production') {
  inv(true, 'alias dev check')
}

setVerbosity('warn')
`

    const output = await runPluginTransform(source)

    expect(output).not.toContain("inv(true, 'alias dev check')")
    expect(output).not.toContain("if (process.env.NODE_ENV !== 'production')")
    expect(output).toContain("import { setVerbosity } from '@vitamin/invariant'")
    expect(output).toContain("setVerbosity('warn')")
  })

  it('preserves else branch while stripping development invariant guard', async () => {
    const source = `
import { invariant } from '@vitamin/invariant'

if (process.env.NODE_ENV !== 'production') {
  invariant(true, 'dev-only')
} else {
  runInProduction()
}
`

    const output = await runPluginTransform(source)

    expect(output).not.toContain("invariant(true, 'dev-only')")
    expect(output).not.toContain("if (process.env.NODE_ENV !== 'production')")
    expect(output).toContain('runInProduction()')
  })

  it('strips whole development guard when invariant appears after other statements', async () => {
    const source = `
import { invariant } from '@vitamin/invariant'

if (process.env.NODE_ENV !== 'production') {
  prepareDebugArtifacts()
  invariant(true, 'dev-only')
}
`

    const output = await runPluginTransform(source)

    expect(output).not.toContain("if (process.env.NODE_ENV !== 'production')")
    expect(output).not.toContain('prepareDebugArtifacts()')
    expect(output).not.toContain("invariant(true, 'dev-only')")
  })

  it('strips whole development guard when invariant appears before other statements', async () => {
    const source = `
import { invariant } from '@vitamin/invariant'

if (process.env.NODE_ENV !== 'production') {
  invariant(true, 'dev-only')
  flushDebugBuffer()
}
`

    const output = await runPluginTransform(source)

    expect(output).not.toContain("if (process.env.NODE_ENV !== 'production')")
    expect(output).not.toContain("invariant(true, 'dev-only')")
    expect(output).not.toContain('flushDebugBuffer()')
  })
})
