// JSONC 解析（支持注释和尾逗号）以及安全 JSON 序列化
import { parse, printParseErrorCode, type ParseError } from 'jsonc-parser'
import stringify from 'safe-stable-stringify'

// 解析 JSONC 字符串（带注释的 JSON）
export function parseJsonc<T = unknown>(input: string): T {
  const errors: ParseError[] = []
  const parsed = parse(input, errors, {
    allowTrailingComma: true,
    disallowComments: false,
    allowEmptyContent: false,
  })

  if (errors.length > 0) {
    const first = errors[0]
    const code = first ? printParseErrorCode(first.error) : 'UnknownError'
    throw new Error(`Invalid JSONC: ${code}`)
  }

  return parsed as T
}

// 安全地将值序列化为 JSON，处理循环引用且保持稳定 key 顺序
export function safeStringify(value: unknown, indent?: number): string {
  return stringify(value, undefined, indent) ?? 'null'
}
