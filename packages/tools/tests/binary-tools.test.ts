import os from 'node:os'
import { chmodSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { afterEach, describe, expect, it } from 'vitest'

import { getThirdPartyToolBinaryPath } from '@vitamin/shared'

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
  public readonly repository = 'owner/repo'

  protected resolveAsset(): string | undefined {
    return undefined
  }

  public ensureCalls = 0

  async ensure(): Promise<string> {
    this.ensureCalls += 1
    return this.name
  }
}

class EnsurePathExecutor extends BinaryToolExecutor {
  public readonly name = 'vitamin_ensure_local_bin'
  public readonly repository = 'owner/repo'

  protected resolveAsset(): string | undefined {
    return undefined
  }
}

class EnsurePathFallbackExecutor extends BinaryToolExecutor {
  public readonly name = 'vitamin_ensure_path_bin'
  public readonly repository = 'owner/repo'

  protected resolveAsset(): string | undefined {
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
    rmSync(getThirdPartyToolBinaryPath('fd') + ext, { force: true })
    rmSync(getThirdPartyToolBinaryPath('ripgrep') + ext, { force: true })
    rmSync(getThirdPartyToolBinaryPath('vitamin_ensure_local_bin') + ext, { force: true })
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

    const exec = new ConfiguredBinaryExecutor('custom', handler)
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
    expect(registry.has('ripgrep')).toBe(true)
  })

  it('fd download resolves correct GitHub asset names by platform/arch', () => {
    const executor = new FindExecutor('/tmp')
    const expectedArch = os.arch() === 'arm64' ? 'aarch64' : 'x86_64'

    expect(executor.repository).toBe('sharkdp/fd')
    expect(executor.resolveAsset('10.0.0', 'darwin', 'arm64')).toBe('fd-v10.0.0-aarch64-apple-darwin.tar.gz')
    expect(executor.resolveAsset('10.0.0', 'linux', 'x64')).toBe('fd-v10.0.0-x86_64-unknown-linux-gnu.tar.gz')
    expect(executor.resolveAsset('10.0.0', 'win32', 'x64')).toBe('fd-v10.0.0-x86_64-pc-windows-msvc.zip')
    expect(executor.resolveAsset('10.0.0', process.platform, os.arch())).toContain(expectedArch)
    expect(executor.resolveAsset('10.0.0', 'freebsd', 'x64')).toBeUndefined()
  })

  it('ripgrep download resolves correct GitHub asset names by platform/arch', () => {
    const executor = new RipgrepExecutor('/tmp')
    const expectedArch = os.arch() === 'arm64' ? 'aarch64' : 'x86_64'

    expect(executor.repository).toBe('BurntSushi/ripgrep')
    expect(executor.resolveAsset('14.1.0', 'darwin', 'arm64')).toBe('ripgrep-v14.1.0-aarch64-apple-darwin.tar.gz')
    expect(executor.resolveAsset('14.1.0', 'linux', 'x64')).toBe('ripgrep-v14.1.0-x86_64-unknown-linux-gnu.tar.gz')
    expect(executor.resolveAsset('14.1.0', 'win32', 'x64')).toBe('ripgrep-v14.1.0-x86_64-pc-windows-msvc.zip')
    expect(executor.resolveAsset('14.1.0', process.platform, os.arch())).toContain(expectedArch)
    expect(executor.resolveAsset('14.1.0', 'freebsd', 'x64')).toBeUndefined()
  })

  it('ensure returns third-party tool path when binary exists locally', async () => {
    const ext = process.platform === 'win32' ? '.exe' : ''
    const localPath = getThirdPartyToolBinaryPath('vitamin_ensure_local_bin') + ext

    mkdirSync(dirname(localPath), { recursive: true })
    writeFileSync(localPath, 'placeholder', 'utf8')

    const executor = new EnsurePathExecutor('/tmp')
    const resolved = await executor.ensure()

    expect(resolved).toBe(localPath)
  })

  it('ensure falls back to executable available in PATH', async () => {
    const binDir = join(tmpdir(), `vitamin-bin-${Date.now()}`)
    const ext = process.platform === 'win32' ? '.exe' : ''
    const toolPath = join(binDir, `vitamin_ensure_path_bin${ext}`)

    mkdirSync(binDir, { recursive: true })
    if (process.platform === 'win32') {
      writeFileSync(toolPath, '@echo off\r\necho vitamin_ensure_path_bin 1.0.0\r\n', 'utf8')
    } else {
      writeFileSync(toolPath, '#!/usr/bin/env sh\necho vitamin_ensure_path_bin 1.0.0\n', 'utf8')
      chmodSync(toolPath, 0o755)
    }

    const sep = process.platform === 'win32' ? ';' : ':'
    process.env.PATH = `${binDir}${sep}${originalPath ?? ''}`

    const executor = new EnsurePathFallbackExecutor('/tmp')
    const resolved = await executor.ensure()

    expect(resolved).toBe('vitamin_ensure_path_bin')

    rmSync(binDir, { recursive: true, force: true })
  })

  it('fd ensure resolves executable path in real environment', async (context) => {
    const canRun = isCommandAvailable('fd')
    const allowDownload = process.env.VITAMIN_TEST_ALLOW_BINARY_DOWNLOAD === '1'

    if (!canRun && !allowDownload) {
      context.skip()
      return
    }

    const executor = new FindExecutor('/tmp')
    const resolved = await executor.ensure()

    expect(typeof resolved).toBe('string')
    expect(resolved.length).toBeGreaterThan(0)
  })

  it('fd execute --version works in real environment', async (context) => {
    const canRun = isCommandAvailable('fd')
    const allowDownload = process.env.VITAMIN_TEST_ALLOW_BINARY_DOWNLOAD === '1'

    if (!canRun && !allowDownload) {
      context.skip()
      return
    }

    const executor = new FindExecutor('/tmp')
    const result = await executor.execute(['--version'])

    expect(result.exitCode).toBe(0)
    expect(result.stdout.toLowerCase()).toContain('fd')
  })

  it('ripgrep ensure resolves executable path in real environment', async (context) => {
    const canRun = isCommandAvailable('ripgrep')
    const allowDownload = process.env.VITAMIN_TEST_ALLOW_BINARY_DOWNLOAD === '1'

    if (!canRun && !allowDownload) {
      context.skip()
      return
    }

    const executor = new RipgrepExecutor('/tmp')
    const resolved = await executor.ensure()

    expect(typeof resolved).toBe('string')
    expect(resolved.length).toBeGreaterThan(0)
  })

  it('ripgrep execute --version works in real environment', async (context) => {
    const canRun = isCommandAvailable('ripgrep')
    const allowDownload = process.env.VITAMIN_TEST_ALLOW_BINARY_DOWNLOAD === '1'

    if (!canRun && !allowDownload) {
      context.skip()
      return
    }

    const executor = new RipgrepExecutor('/tmp')
    const result = await executor.execute(['--version'])

    expect(result.exitCode).toBe(0)
    expect(result.stdout.toLowerCase()).toContain('ripgrep')
  })

})
