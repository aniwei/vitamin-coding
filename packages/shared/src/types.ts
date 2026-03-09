// 所有 @vitamin/* 包共享的公共类型

// 品牌类型辅助 —— 从基础类型创建名义类型
// 用法示例：type UserId = Brand<string, 'UserId'>
export type Brand<T, B extends string> = T & { readonly __brand: B }

// 深度可选 —— 递归地将所有属性设为可选
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P]
}

// 深度只读 —— 递归地将所有属性设为只读
export type DeepReadonly<T> = {
  readonly [P in keyof T]: T[P] extends object ? DeepReadonly<T[P]> : T[P]
}

// 提取 Promise 的解析类型
export type Awaitable<T> = T | Promise<T>

// 返回 void 的回调函数，用于清理回调
export type VoidCallback = () => void

// 返回 Promise<void> 的异步回调函数
export type AsyncVoidCallback = () => Promise<void>
