type Resolve<R> = (value: R) => void
type Reject = (error: Error) => void

type Waiter<E> = {
  resolve: (value: IteratorResult<E>) => void
  reject: Reject
}

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

  get isComplete(): boolean {
    return this.done
  }

  get lastResult(): R | undefined {
    return this.cachedResult
  }

  constructor() {
    this.promise = new Promise<R>((resolve, reject) => {
      this.resolve = resolve
      this.reject = reject
    })
  }

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

  complete(result: R): void {
    if (this.done) return

    this.done = true
    this.cachedResult = result
    this.resolve?.(result)
    
    for (const waiter of this.waiters) {
      waiter.resolve({ value: undefined as never, done: true })
    }

    this.waiters = []
  }

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

  abort(): void {
    this.abortController?.abort()
    this.fail(new Error('EventStream aborted'))
  }

  setAbortController(controller: AbortController): void {
    this.abortController = controller
  }

  result(): Promise<R> {
    return this.promise
  }

  [Symbol.asyncIterator](): AsyncIterator<E> {
    let index = 0
    return {
      next: () => {
        if (index < this.events.length) {
          return Promise.resolve({ value: this.events[index++]!, done: false })
        }

        if (this.done) {
          if (this.error) {
            return Promise.reject(this.error)
          }
          return Promise.resolve({ value: undefined as never, done: true })
        }
        
        return new Promise<IteratorResult<E>>((resolve, reject) => {
          this.waiters.push({ resolve, reject })
        })
      },
    }
  }
}

export function createEventStream<E, R>(): EventStream<E, R> {
  return new EventStream<E, R>()
}
