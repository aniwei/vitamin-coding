import { parse, printParseErrorCode, type ParseError } from 'jsonc-parser'
import stringify from 'safe-stable-stringify'

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

export function safeStringify(value: unknown, indent?: number): string {
  return stringify(value, undefined, indent) ?? 'null'
}
