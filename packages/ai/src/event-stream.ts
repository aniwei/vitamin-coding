// EventStream 异步可迭代流式结果
// 同时支持 for-await-of 和 .result() 双模式

// 流完成后的回调类型
type Resolve<R> = (value: R) => void
type Reject = (error: Error) => void

type Waiter<E> = {
  resolve: (value: IteratorResult<E>) => void
  reject: Reject
}

// EventStream 流式事件迭代器 + 最终结果 Promise
export class EventStream<E, R> implements AsyncIterable<E> {
  private readonly events: E[] = []
  private waiters: Waiter<E>[] = []

  private done = false
  private cachedResult: R | undefined
  private error: Error | undefined
  private resolve: Resolve<R> | undefined
  private reject: Reject | undefined

  private readonly promise: Promise<R>
  private abortController: AbortController | undefined

  constructor() {
    this.promise = new Promise<R>((resolve, reject) => {
      this.resolve = resolve
      this.reject = reject
    })
  }

  // 推送一个事件到流
  push(event: E): void {
    if (this.done) return
    
    if (this.waiters.length > 0) {
      const waiter = this.waiters.shift()
      if (waiter) {
        waiter.resolve({ value: event, done: false })
      } 

      // TODO warn no waiter to receive event
    } else {
      this.events.push(event)
    }
  }

  // 标记流完成，传入最终结果
  complete(result: R): void {
    if (this.done) return

    this.done = true
    this.cachedResult = result
    this.resolve?.(result)
    
    // 唤醒所有等待中的消费者
    for (const waiter of this.waiters) {
      waiter.resolve({ value: undefined as never, done: true })
    }

    this.waiters = []
  }

  // 标记流失败
  fail(error: Error): void {
    if (this.done) return
    this.done = true
    this.error = error
    this.reject?.(error)

    for (const waiter of this.waiters) {
      waiter.reject(error)
    }

    this.waiters = []
  }

  // 取消流
  abort(): void {
    this.abortController?.abort()
    this.fail(new Error('EventStream aborted'))
  }

  // 设置外部 AbortController（用于关联 signal）
  setAbortController(controller: AbortController): void {
    this.abortController = controller
  }

  // 等待完整结果
  result(): Promise<R> {
    return this.promise
  }

  // 是否已结束
  get isComplete(): boolean {
    return this.done
  }

  // 同步获取缓存结果（仅在 isComplete 后可用）
  get lastResult(): R | undefined {
    return this.cachedResult
  }

  // AsyncIterable 实现
  [Symbol.asyncIterator](): AsyncIterator<E> {
    let index = 0
    return {
      next: () => {
        // 有缓冲事件，立即返回
        if (index < this.events.length) {
          return Promise.resolve({ value: this.events[index++]!, done: false })
        }
        // 流已结束
        if (this.done) {
          if (this.error) {
            return Promise.reject(this.error)
          }
          return Promise.resolve({ value: undefined as never, done: true })
        }
        // 等待下一个事件
        return new Promise<IteratorResult<E>>((resolve, reject) => {
          this.waiters.push({ resolve, reject })
        })
      },
    }
  }
}

// 创建 EventStream 的工厂函数
export function createEventStream<E, R>(): EventStream<E, R> {
  return new EventStream<E, R>()
}
