import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

const {
  sharedExistsMock,
  sharedBinaryPathMock,
  spawnMock,
} = vi.hoisted(() => ({
  sharedExistsMock: vi.fn(),
  sharedBinaryPathMock: vi.fn((name: string) => `/mock/bin/${name}`),
  spawnMock: vi.fn(),
}))

vi.mock('@vitamin/shared', () => {
  return {
    exists: sharedExistsMock,
    getThirdPartyToolBinaryPath: sharedBinaryPathMock,
    getThirdPartyToolPath: vi.fn(() => '/mock/bin'),
    mkdirp: vi.fn(async () => undefined),
    createLogger: vi.fn(() => ({
      warn: vi.fn(),
      info: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    })),
  }
})

vi.mock('node:child_process', () => {
  return {
    spawn: spawnMock,
    spawnSync: vi.fn(() => ({ status: 0, stderr: Buffer.from('') })),
  }
})

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
}

describe('binary tools', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sharedExistsMock.mockReset()
    sharedBinaryPathMock.mockReset()
    spawnMock.mockReset()
    sharedBinaryPathMock.mockImplementation((name: string) => `/mock/bin/${name}`)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  function mockSpawnForVersionFailure() {
    spawnMock.mockImplementation(() => {
      const ps = new EventEmitter() as any
      ps.stdout = new PassThrough()
      ps.stderr = new PassThrough()
      queueMicrotask(() => {
        ps.emit('close', 1)
      })
      return ps
    })

    return spawnMock
  }

  function mockSpawnForSuccess(stdoutText: string, stderrText = '') {
    spawnMock.mockImplementation(() => {
      const ps = new EventEmitter() as any
      ps.stdout = new PassThrough()
      ps.stderr = new PassThrough()

      queueMicrotask(() => {
        ps.stdout.write(stdoutText)
        ps.stdout.end()
        if (stderrText) {
          ps.stderr.write(stderrText)
        }
        ps.stderr.end()
        ps.emit('close', 0)
      })

      return ps
    })

    return spawnMock
  }

  it('ConfiguredBinaryExecutor delegates execute call', async () => {
    const handler = vi.fn(async (): Promise<BinaryToolExecutionResult> => ({
      stdout: 'ok',
      stderr: '',
      exitCode: 0,
    }))

    const exec = new ConfiguredBinaryExecutor('custom', handler)
    const result = await exec.execute(['--version'])

    expect(handler).toHaveBeenCalledTimes(1)
    expect(result.stdout).toBe('ok')
  })

  it('registry ensure throws for unknown tool', async () => {
    const registry = new BinaryToolExecutorRegistry()
    await expect(registry.ensure('ghost')).rejects.toThrow('Tool ghost not found in registry')
  })

  it('registry ensure calls BinaryToolExecutor.ensure for executor instances', async () => {
    const registry = new BinaryToolExecutorRegistry()
    const dummy = new DummyBinaryExecutor('/tmp')
    const ensureSpy = vi.spyOn(dummy, 'ensure').mockResolvedValue('dummy')

    registry.register(dummy)
    await registry.ensure('dummy')

    expect(ensureSpy).toHaveBeenCalledTimes(1)
  })

  it('createBinaryToolExecutorRegistry registers fd and ripgrep executors', () => {
    const registry = createBinaryToolExecutorRegistry('/tmp')

    expect(registry.has('fd')).toBe(true)
    expect(registry.has('ripgrep')).toBe(true)
  })

  it('fd ensure triggers download when binary is missing', async () => {
    sharedExistsMock
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true)
    mockSpawnForVersionFailure()

    const executor = new FindExecutor('/tmp')
    const downloadSpy = vi
      .spyOn(executor as any, 'download')
      .mockResolvedValue(undefined)

    const resolved = await executor.ensure()

    expect(downloadSpy).toHaveBeenCalledTimes(1)
    expect(resolved).toContain('/mock/bin/fd')
  })

  it('ripgrep ensure triggers download when binary is missing', async () => {
    sharedExistsMock
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true)
    mockSpawnForVersionFailure()

    const executor = new RipgrepExecutor('/tmp')
    const downloadSpy = vi
      .spyOn(executor as any, 'download')
      .mockResolvedValue(undefined)

    const resolved = await executor.ensure()

    expect(downloadSpy).toHaveBeenCalledTimes(1)
    expect(resolved).toContain('/mock/bin/ripgrep')
  })

  it('fd execute runs resolved binary and returns stdout', async () => {
    const spawnSpy = mockSpawnForSuccess('fd 1.0.0\n')
    const executor = new FindExecutor('/tmp')
    vi.spyOn(executor, 'ensure').mockResolvedValue('/mock/bin/fd')

    const result = await executor.execute(['--version'])

    expect(spawnSpy).toHaveBeenCalledWith('/mock/bin/fd', ['--version'], {
      cwd: undefined,
      env: undefined,
      timeout: undefined,
    })
    expect(result.stdout).toContain('fd 1.0.0')
    expect(result.exitCode).toBe(0)
  })

  it('ripgrep execute runs resolved binary and returns stdout', async () => {
    const spawnSpy = mockSpawnForSuccess('ripgrep 14.1.0\n')
    const executor = new RipgrepExecutor('/tmp')
    vi.spyOn(executor, 'ensure').mockResolvedValue('/mock/bin/ripgrep')

    const result = await executor.execute(['--version'])

    expect(spawnSpy).toHaveBeenCalledWith('/mock/bin/ripgrep', ['--version'], {
      cwd: undefined,
      env: undefined,
      timeout: undefined,
    })
    expect(result.stdout).toContain('ripgrep 14.1.0')
    expect(result.exitCode).toBe(0)
  })
})
