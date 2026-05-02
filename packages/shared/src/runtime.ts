import { Error as VitaminError } from './error'

export class RuntimeTimeoutError extends VitaminError {
  constructor(message: string, metadata?: Record<string, unknown>) {
    super(message, {
      code: 'RUNTIME_TIMEOUT',
      retryable: true,
      metadata,
    })
    this.name = 'RuntimeTimeoutError'
  }
}

export class RuntimeAbortError extends VitaminError {
  constructor(message = 'Operation aborted', metadata?: Record<string, unknown>) {
    super(message, {
      code: 'RUNTIME_ABORTED',
      metadata,
    })
    this.name = 'RuntimeAbortError'
  }
}

export interface SleepOptions {
  signal?: AbortSignal
}

export function sleep(ms: number, options?: SleepOptions): Promise<void> {
  const delay = Math.max(0, Math.floor(ms))
  const { signal } = options ?? {}

  if (signal?.aborted) {
    return Promise.reject(createAbortError(signal))
  }

  return new Promise((resolve, reject) => {
    let timeout: ReturnType<typeof setTimeout> | undefined

    const cleanup = () => {
      if (timeout) {
        clearTimeout(timeout)
      }
      signal?.removeEventListener('abort', onAbort)
    }

    const onAbort = () => {
      cleanup()
      reject(createAbortError(signal))
    }

    timeout = setTimeout(() => {
      cleanup()
      resolve()
    }, delay)

    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

export interface WithTimeoutOptions {
  onTimeout?: () => void
  createTimeoutError?: (timeoutMs: number) => Error
}

export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number | undefined,
  options?: WithTimeoutOptions,
): Promise<T> {
  if (!timeoutMs || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return promise
  }

  const timeout = Math.floor(timeoutMs)
  let timer: ReturnType<typeof setTimeout> | undefined

  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      options?.onTimeout?.()
      reject(
        options?.createTimeoutError?.(timeout) ??
          new RuntimeTimeoutError(`Operation timed out after ${timeout}ms`, { timeoutMs: timeout }),
      )
    }, timeout)
  })

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timer) {
      clearTimeout(timer)
    }
  })
}

export async function limitConcurrency<T>(
  tasks: Array<() => Promise<T>>,
  maxConcurrency: number,
): Promise<T[]> {
  if (tasks.length === 0) {
    return []
  }

  const limit = Math.max(1, Math.min(Math.floor(maxConcurrency), tasks.length))
  const results: T[] = Array.from({ length: tasks.length })
  let nextIndex = 0

  async function runNext(): Promise<void> {
    while (nextIndex < tasks.length) {
      const index = nextIndex++
      const task = tasks[index]
      if (!task) {
        continue
      }
      results[index] = await task()
    }
  }

  await Promise.all(Array.from({ length: limit }, () => runNext()))
  return results
}

function createAbortError(signal: AbortSignal | undefined): Error {
  if (signal?.reason instanceof Error) {
    return signal.reason
  }

  return new RuntimeAbortError(
    typeof signal?.reason === 'string' ? signal.reason : 'Operation aborted',
  )
}
