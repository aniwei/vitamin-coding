export class Lock {
  private locks: Map<string, Promise<void>> = new Map()

  read(key: string): Promise<void> {
    return this.locks.get(key) ?? Promise.resolve()
  }

  get(key: string): Promise<void> | undefined {
    return this.locks.get(key)
  }

  assert(key: string): Promise<void> {
    if (!this.locks.has(key)) {
      return Promise.resolve()
    }

    throw new Error(`Resource ${key} is currently locked. Please try again later.`)
  }

  async withLock<T>(
    key: string, 
    execute: () => Promise<T>
  ): Promise<T> {
    const currentLock = this.locks.get(key) ?? Promise.resolve()
    let release: () => void = () => {}

    const nextLock = new Promise<void>((resolve) => release = resolve)
    const chained = currentLock.then(() => nextLock)

    this.locks.set(key, chained)
    await currentLock

    try {
      return await execute()
    } finally {
      release()
      if (this.locks.get(key) === chained) {
        this.locks.delete(key)
      }
    }
  }
}
  
export function createLock(): Lock {
  return new Lock()
}