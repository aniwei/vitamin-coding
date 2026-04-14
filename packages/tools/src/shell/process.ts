import { spawn as childProcessSpawn, type ChildProcess } from 'node:child_process'

type ProgressCallback = (chunk: Buffer) => void

export interface SpawnExecuteOptions {
  timeout: number
  cwd?: string
  signal?: AbortSignal
  env?: Record<string, string>
  onProgress?: ProgressCallback
}

export interface SpawnExecuteResult {
  chunks: Buffer
  exitCode: number
  timedOut: boolean
}

const createExecuteResult = (): SpawnExecuteResult => ({
  chunks: Buffer.alloc(0),
  exitCode: -1,
  timedOut: false,
})

const kill = (child: ChildProcess) => {
  const pid = child.pid
  if (!pid) return

  try {
    switch (process.platform) {
      case 'win32': {
        const args = ['/F', '/T', '/PID', `${pid}`]
        childProcessSpawn('taskkill', args, { stdio: 'ignore', detached: true })
        break
      }
      default: {
        process.kill(-pid, 'SIGKILL')

        try {
          process.kill(pid, 'SIGKILL')
        } catch {
          console.warn(`Failed to kill process ${pid}, it may still be running.`)
        }
      }
    }
  } catch {
    console.warn(`Failed to kill process ${pid}, it may still be running.`)
  }
}

export function spawn(
  command: string,
  args: string[],
  options: SpawnExecuteOptions,
): Promise<SpawnExecuteResult> {
  const { cwd, env, timeout, signal, onProgress } = options

  return new Promise<SpawnExecuteResult>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('Process execution aborted before start'))
      return
    }

    const result: SpawnExecuteResult = createExecuteResult()

    const timer = setTimeout(() => {
      result.timedOut = true
      kill(child)
    }, timeout)

    const onAbort = () => kill(child)
    signal?.addEventListener('abort', onAbort, { once: true })

    const cleanup = () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
    }

    const child = childProcessSpawn(command, args, {
      cwd,
      env: env ? { ...process.env, ...env } : undefined,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    child.stdout?.on('data', (chunk: Buffer) => {
      result.chunks = Buffer.concat([result.chunks, chunk])
      onProgress?.(chunk)
    })

    child.stderr?.on('data', (chunk: Buffer) => {
      result.chunks = Buffer.concat([result.chunks, chunk])
      onProgress?.(chunk)
    })

    child.on('error', (error) => {
      cleanup()
      reject(error)
    })

    child.on('close', (code) => {
      result.exitCode = code ?? -1
      cleanup()

      if (result.timedOut) {
        reject(new Error(`Process timed out after ${timeout}ms`))
      } else {
        resolve(result)
      }
    })
  })
}
