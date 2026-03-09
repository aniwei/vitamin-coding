// 事件映射约束：每个键映射到一个处理函数
export type Events = {
  [event: string]: (...args: never[]) => void
}

// 类型安全的事件发射器，支持泛型事件映射
// 在编译时拒绝不正确的事件名称和载荷类型
export class TypedEventEmitter<T extends Events> {
  private readonly listeners = new Map<keyof T, Set<(...args: never[]) => void>>()

  // 订阅事件，返回取消订阅函数
  on<K extends keyof T>(event: K, handler: T[K]): () => void {
    let set = this.listeners.get(event)
    if (!set) {
      set = new Set()
      this.listeners.set(event, set)
    }
    set.add(handler as (...args: never[]) => void)
    return () => this.off(event, handler)
  }

  // 取消订阅事件
  off<K extends keyof T>(event: K, handler: T[K]): void {
    this.listeners.get(event)?.delete(handler as (...args: never[]) => void)
  }

  // 触发事件，传递类型化参数
  emit<K extends keyof T>(event: K, ...args: Parameters<T[K]>): void {
    const set = this.listeners.get(event)
    if (!set) return
    for (const handler of set) {
      ;(handler as T[K])(...args)
    }
  }

  // 仅订阅事件的下一次触发，返回取消订阅函数
  once<K extends keyof T>(event: K, handler: T[K]): () => void {
    const once = ((...args: Parameters<T[K]>) => {
      this.off(event, once as T[K])
      ;(handler as (...args: Parameters<T[K]>) => void)(...args)
    }) as T[K]
    return this.on(event, once)
  }

  // 移除所有监听器，可选按事件名过滤
  removeAllListeners<K extends keyof T>(event?: K): void {
    if (event !== undefined) {
      this.listeners.delete(event)
    } else {
      this.listeners.clear()
    }
  }

  // 获取指定事件的监听器数量
  listenerCount<K extends keyof T>(event: K): number {
    return this.listeners.get(event)?.size ?? 0
  }
}
