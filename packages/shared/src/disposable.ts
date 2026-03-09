// 资源释放协议，支持 ECMAScript using / await using 语义
// 同步可释放资源
export interface Disposable {
  [Symbol.dispose](): void
}

// 异步可释放资源
export interface AsyncDisposable {
  [Symbol.asyncDispose](): Promise<void>
}

// 从清理函数创建同步可释放对象
export function createDisposable(cleanup: () => void): Disposable {
  return {
    [Symbol.dispose]() {
      cleanup()
    },
  }
}

// 从清理函数创建异步可释放对象
export function createAsyncDisposable(cleanup: () => Promise<void>): AsyncDisposable {
  return {
    [Symbol.asyncDispose]() {
      return cleanup()
    },
  }
}

// 可释放资源栈管理器
// 释放时按 LIFO 顺序清理资源
export class DisposableStack implements Disposable {
  private readonly cleanups: (() => void)[] = []
  private disposed = false

  // 追踪一个可释放资源，栈释放时会一并释放
  use<T extends Disposable>(resource: T): T {
    this.ensureNotDisposed()
    this.cleanups.push(() => resource[Symbol.dispose]())
    return resource
  }

  // 注册一个清理回调，在栈释放时执行
  defer(cleanup: () => void): void {
    this.ensureNotDisposed()
    this.cleanups.push(cleanup)
  }

  // 该栈是否已被释放
  get isDisposed(): boolean {
    return this.disposed
  }

  [Symbol.dispose](): void {
    if (this.disposed) return
    this.disposed = true

    const errors: Error[] = []
    for (let i = this.cleanups.length - 1; i >= 0; i--) {
      try {
        const cleanup = this.cleanups[i]
        if (cleanup) cleanup()
      } catch (error) {
        errors.push(error instanceof Error ? error : new Error(String(error)))
      }
    }
    this.cleanups.length = 0

    if (errors.length === 1) {
      throw errors[0]
    }
    if (errors.length > 1) {
      throw new AggregateError(errors, 'Multiple disposal errors')
    }
  }

  private ensureNotDisposed(): void {
    if (this.disposed) {
      throw new Error('DisposableStack has already been disposed')
    }
  }
}

// 异步可释放资源栈管理器
// 释放时按 LIFO 顺序清理资源
export class AsyncDisposableStack implements AsyncDisposable {
  private readonly cleanups: (() => void | Promise<void>)[] = []
  private disposed = false

  // 追踪一个异步可释放资源
  use<T extends AsyncDisposable>(resource: T): T {
    this.ensureNotDisposed()
    this.cleanups.push(() => resource[Symbol.asyncDispose]())
    return resource
  }

  // 追踪一个同步可释放资源
  useSync<T extends Disposable>(resource: T): T {
    this.ensureNotDisposed()
    this.cleanups.push(() => resource[Symbol.dispose]())
    return resource
  }

  // 注册一个异步清理回调
  defer(cleanup: () => void | Promise<void>): void {
    this.ensureNotDisposed()
    this.cleanups.push(cleanup)
  }

  // 该栈是否已被释放
  get isDisposed(): boolean {
    return this.disposed
  }

  async [Symbol.asyncDispose](): Promise<void> {
    if (this.disposed) return
    this.disposed = true

    const errors: Error[] = []
    for (let i = this.cleanups.length - 1; i >= 0; i--) {
      try {
        const cleanup = this.cleanups[i]
        if (cleanup) await cleanup()
      } catch (error) {
        errors.push(error instanceof Error ? error : new Error(String(error)))
      }
    }
    this.cleanups.length = 0

    if (errors.length === 1) {
      throw errors[0]
    }
    if (errors.length > 1) {
      throw new AggregateError(errors, 'Multiple disposal errors')
    }
  }

  private ensureNotDisposed(): void {
    if (this.disposed) {
      throw new Error('AsyncDisposableStack has already been disposed')
    }
  }
}
