// 事件映射约束：每个键映射到一个处理函数
export type Events = {
  [event: string]: (...args: never[]) => void
}

export class TypedEventEmitter<T extends Events> {
  private readonly listeners: Partial<{ [K in keyof T]: Set<T[K]> }> = {}

  // 订阅事件，返回取消订阅函数
  on<K extends keyof T>(event: K, listener: T[K]): () => void {
    let set = this.listeners[event] as Set<T[K]> | undefined
    if (!set) {
      set = new Set<T[K]>()
      this.listeners[event] = set
    }
    set.add(listener)
    return () => this.off(event, listener)
  }

  // 取消订阅事件
  off<K extends keyof T>(event: K, listener: T[K]): void {
    this.listeners[event]?.delete(listener)
  }

  // 触发事件，传递类型化参数
  emit<K extends keyof T>(event: K, ...args: Parameters<T[K]>): void {
    const set = this.listeners[event]
    if (!set) return
    for (const listener of set) {
      ;(listener as (...listenerArgs: Parameters<T[K]>) => void)(...args)
    }
  }

  // 仅订阅事件的下一次触发，返回取消订阅函数
  once<K extends keyof T>(event: K, listener: T[K]): () => void {
    const once = ((...args: Parameters<T[K]>) => {
      this.off(event, once as T[K])
      ;(listener as (...args: Parameters<T[K]>) => void)(...args)
    }) as T[K]
    return this.on(event, once)
  }

  // 移除所有监听器，可选按事件名过滤
  removeAllListeners<K extends keyof T>(event?: K): void {
    if (event !== undefined) {
      delete this.listeners[event]
    } else {
      for (const key of Object.keys(this.listeners) as Array<keyof T>) {
        delete this.listeners[key]
      }
    }
  }

  // 获取指定事件的监听器数量
  listenerCount<K extends keyof T>(event: K): number {
    return this.listeners[event]?.size ?? 0
  }
}
