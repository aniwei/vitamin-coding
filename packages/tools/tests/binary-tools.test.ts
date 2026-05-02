import os from 'node:os'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { afterEach, describe, expect, it } from 'vitest'

import { getThirdPartyToolBinaryDir, getThirdPartyToolDir } from '@x-mars/shared'

import {
  BinaryToolExecutor,
  ConfiguredBinaryExecutor,
  type BinaryToolExecutionResult,
} from '../src/binary/binary-executor'
import { FindExecutor } from '../src/binary/find'
import { RipgrepExecutor } from '../src/binary/ripgrep'
import {
  BinaryToolExecutorRegistry,
  createBinaryToolExecutorRegistry,
} from '../src/binary/binary-executor-registry'

class DummyBinaryExecutor extends BinaryToolExecutor {
  public readonly name = 'dummy'
  public readonly version = '1.0.0'
  public readonly repository = 'owner/repo'

  protected resolveUrl(): string | undefined {
    return undefined
  }

  public ensureCalls = 0

  async ensure(): Promise<string> {
    this.ensureCalls += 1
    return this.name
  }
}

class EnsurePathExecutor extends BinaryToolExecutor {
  public readonly name = 'x_mars_ensure_local_bin'
  public readonly version = '1.0.0'
  public readonly repository = 'owner/repo'

  protected resolveUrl(): string | undefined {
    return undefined
  }
}

class EnsurePathFallbackExecutor extends BinaryToolExecutor {
  public readonly name = 'node'
  public readonly version = '1.0.0'
  public readonly repository = 'owner/repo'

  protected resolveUrl(): string | undefined {
    return undefined
  }
}

function isCommandAvailable(command: string): boolean {
  const checker = process.platform === 'win32' ? 'where' : 'which'
  const result = spawnSync(checker, [command], { stdio: 'pipe' })
  return result.status === 0
}

describe('binary tools', () => {
  const originalPath = process.env.PATH

  afterEach(() => {
    const ext = process.platform === 'win32' ? '.exe' : ''
    rmSync(getThirdPartyToolBinaryDir('fd') + ext, { force: true })
    rmSync(getThirdPartyToolBinaryDir('ripgrep') + ext, { force: true })
    rmSync(getThirdPartyToolBinaryDir('x_mars_ensure_local_bin') + ext, { force: true })
    rmSync(join(getThirdPartyToolDir(), 'fd-10.4.2'), { recursive: true, force: true })
    rmSync(join(getThirdPartyToolDir(), 'rg-15.1.0'), { recursive: true, force: true })
    rmSync(join(getThirdPartyToolDir(), 'x_mars_ensure_local_bin-1.0.0'), { recursive: true, force: true })
    process.env.PATH = originalPath
  })

  it('ConfiguredBinaryExecutor delegates execute call', async () => {
    let callCount = 0
    const handler = async (): Promise<BinaryToolExecutionResult> => {
      callCount += 1
      return {
        stdout: 'ok',
        stderr: '',
        exitCode: 0,
      }
    }

    const exec = new ConfiguredBinaryExecutor('custom', '1.0.0', handler)
    const result = await exec.execute(['--version'])

    expect(callCount).toBe(1)
    expect(result.stdout).toBe('ok')
  })

  it('registry ensure throws for unknown tool', async () => {
    const registry = new BinaryToolExecutorRegistry()
    await expect(registry.ensure('ghost')).rejects.toThrow('Tool ghost not found in registry')
  })

  it('registry ensure calls BinaryToolExecutor.ensure for executor instances', async () => {
    const registry = new BinaryToolExecutorRegistry()
    const dummy = new DummyBinaryExecutor('/tmp')

    registry.register(dummy)
    await registry.ensure('dummy')

    expect(dummy.ensureCalls).toBe(1)
  })

  it('createBinaryToolExecutorRegistry registers fd and ripgrep executors', () => {
    const registry = createBinaryToolExecutorRegistry('/tmp')

    expect(registry.has('fd')).toBe(true)
    expect(registry.has('rg')).toBe(true)
  })

  it('fd download resolves correct GitHub asset names by platform/arch', () => {
    const executor = new FindExecutor('/tmp')
    const expectedArch = os.arch() === 'arm64' ? 'aarch64' : 'x86_64'
    const url = executor.resolveUrl()

    expect(executor.repository).toBe('sharkdp/fd')
    expect(typeof url).toBe('string')
    expect(url).toContain('https://github.com/sharkdp/fd/releases/download/v10.4.2/')
    expect(url).toContain(expectedArch)
  })

  it('ripgrep download resolves correct GitHub asset names by platform/arch', () => {
    const executor = new RipgrepExecutor('/tmp')
    const expectedArch = os.arch() === 'arm64' ? 'aarch64' : 'x86_64'
    const url = executor.resolveUrl()

    expect(executor.repository).toBe('BurntSushi/ripgrep')
    expect(typeof url).toBe('string')
    expect(url).toContain('https://github.com/BurntSushi/ripgrep/releases/download/15.1.0/')
    expect(url).toContain(expectedArch)
  })

  it('ensure returns third-party tool path when binary exists locally', async () => {
    const ext = process.platform === 'win32' ? '.exe' : ''
    const localPath =
      getThirdPartyToolBinaryDir('x_mars_ensure_local_bin-1.0.0', 'x_mars_ensure_local_bin') + ext

    mkdirSync(dirname(localPath), { recursive: true })
    writeFileSync(localPath, 'placeholder', 'utf8')

    const executor = new EnsurePathExecutor('/tmp')
    const resolved = await executor.ensure()

    expect(resolved).toBe(localPath)
  })

  it('ensure falls back to executable available in PATH', async () => {
    const executor = new EnsurePathFallbackExecutor('/tmp')
    const resolved = await executor.ensure()

    expect(resolved).toBe('node')
  })

  it('fd ensure resolves executable path in real environment', async () => {
    const canRun = isCommandAvailable('fd')
    const allowDownload = process.env.X_MARS_TEST_ALLOW_BINARY_DOWNLOAD === '1'

    if (!canRun && !allowDownload) {
      return
    }

    const executor = new FindExecutor('/tmp')
    const resolved = await executor.ensure()

    expect(typeof resolved).toBe('string')
    expect(resolved.length).toBeGreaterThan(0)
  })

  it('fd execute --version works in real environment', async () => {
    const canRun = isCommandAvailable('fd')
    const allowDownload = process.env.X_MARS_TEST_ALLOW_BINARY_DOWNLOAD === '1'

    if (!canRun && !allowDownload) {
      return
    }

    const executor = new FindExecutor('/tmp')
    const result = await executor.execute(['--version'])

    expect(result.exitCode).toBe(0)
    expect(result.stdout.toLowerCase()).toContain('fd')
  })

  it('ripgrep ensure resolves executable path in real environment', async () => {
    const canRun = isCommandAvailable('rg')
    const allowDownload = process.env.X_MARS_TEST_ALLOW_BINARY_DOWNLOAD === '1'

    if (!canRun && !allowDownload) {
      return
    }

    const executor = new RipgrepExecutor('/tmp')
    const resolved = await executor.ensure()

    expect(typeof resolved).toBe('string')
    expect(resolved.length).toBeGreaterThan(0)
  })

  it('ripgrep execute --version works in real environment', async () => {
    const canRun = isCommandAvailable('rg')
    const allowDownload = process.env.X_MARS_TEST_ALLOW_BINARY_DOWNLOAD === '1'

    if (!canRun && !allowDownload) {
      return
    }

    const executor = new RipgrepExecutor('/tmp')
    const result = await executor.execute(['--version'])

    expect(result.exitCode).toBe(0)
    expect(result.stdout.toLowerCase()).toContain('ripgrep')
  })

})
