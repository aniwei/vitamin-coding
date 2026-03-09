// 子进程管理：超时控制、信号转发和输出捕获
import { spawn as nodeSpawn } from 'node:child_process'

const DEFAULT_TIMEOUT = 30_000
const SIGKILL_GRACE_PERIOD = 5_000
const DEFAULT_MAX_OUTPUT = 60 * 1024 // 60 KB

export interface SpawnOptions {
  command: string
  args?: string[]
  cwd?: string
  // 超时时间（毫秒），超时后：SIGTERM → 5秒 → SIGKILL
  timeout?: number
  // 每个流的最大输出字节数（默认 60 KB），超出部分被截断
  maxOutputSize?: number
  // 外部取消信号
  signal?: AbortSignal
  env?: Record<string, string>
}

export interface SpawnResult {
  stdout: string
  stderr: string
  exitCode: number
  signal?: string
  // stdout 或 stderr 是否被截断
  truncated: boolean
  // 进程是否因超时被终止
  timedOut: boolean
}

// 启动子进程，支持超时 + 信号转发 + 输出限制
export function spawnProcess(options: SpawnOptions): Promise<SpawnResult> {
  const {
    command,
    args = [],
    cwd,
    timeout = DEFAULT_TIMEOUT,
    maxOutputSize = DEFAULT_MAX_OUTPUT,
    signal,
    env,
  } = options

  return new Promise<SpawnResult>((resolve, reject) => {
    // 检查信号是否已经被取消，避免启动无效进程
    if (signal?.aborted) {
      reject(new Error('Aborted'))
      return
    }

    let timedOut = false
    let truncated = false
    let stdoutSize = 0
    let stderrSize = 0

    const stdoutChunks: Buffer[] = []
    const stderrChunks: Buffer[] = []

    const child = nodeSpawn(command, args, {
      cwd,
      env: env ? { ...process.env, ...env } : undefined,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    const timeoutId = setTimeout(() => {
      timedOut = true
      child.kill('SIGTERM')
      setTimeout(() => {
        if (!child.killed) {
          child.kill('SIGKILL')
        }
      }, SIGKILL_GRACE_PERIOD)
    }, timeout)

    const onAbort = () => {
      child.kill('SIGTERM')
      setTimeout(() => {
        if (!child.killed) {
          child.kill('SIGKILL')
        }
      }, SIGKILL_GRACE_PERIOD)
    }

    signal?.addEventListener('abort', onAbort, { once: true })

    child.stdout?.on('data', (chunk: Buffer) => {
      if (stdoutSize < maxOutputSize) {
        const remaining = maxOutputSize - stdoutSize
        stdoutChunks.push(chunk.length <= remaining ? chunk : chunk.subarray(0, remaining))
        if (chunk.length > remaining) {
          truncated = true
        }
      } else {
        truncated = true
      }
      stdoutSize += chunk.length
    })

    child.stderr?.on('data', (chunk: Buffer) => {
      if (stderrSize < maxOutputSize) {
        const remaining = maxOutputSize - stderrSize
        stderrChunks.push(chunk.length <= remaining ? chunk : chunk.subarray(0, remaining))
        if (chunk.length > remaining) {
          truncated = true
        }
      } else {
        truncated = true
      }
      stderrSize += chunk.length
    })

    child.on('error', (error) => {
      clearTimeout(timeoutId)
      signal?.removeEventListener('abort', onAbort)
      reject(error)
    })

    child.on('close', (code, sig) => {
      clearTimeout(timeoutId)
      signal?.removeEventListener('abort', onAbort)
      resolve({
        stdout: Buffer.concat(stdoutChunks).toString('utf-8'),
        stderr: Buffer.concat(stderrChunks).toString('utf-8'),
        exitCode: code ?? 1,
        signal: sig ?? undefined,
        truncated,
        timedOut,
      })
    })
  })
}
