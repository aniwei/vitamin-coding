// Token 估算工具
// 基于字符数和词数的粗略估算（不依赖外部 tokenizer）

// 估算文本的 token 数（粗略）
// 平均每个 token 约 4 个英文字符 / 1.5 个中文字符
export function estimateTokenCount(text: string): number {
  if (!text) return 0

  let count = 0
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0
    // CJK 字符范围（中日韩统一表意文字）
    if (
      (code >= 0x4e00 && code <= 0x9fff) ||
      (code >= 0x3400 && code <= 0x4dbf) ||
      (code >= 0x20000 && code <= 0x2a6df)
    ) {
      // 中文字符约 1.5 token / 字
      count += 1.5
    } else if (code > 127) {
      // 其他非 ASCII 字符
      count += 1
    } else {
      // ASCII 字符约 0.25 token / 字符
      count += 0.25
    }
  }

  return Math.ceil(count)
}

// 估算消息数组的总 token 数
export function estimateMessagesTokens(
  messages: Array<{ role: string; content: unknown }>,
): number {
  let total = 0
  for (const msg of messages) {
    // 每条消息的角色标签开销约 4 token
    total += 4
    if (typeof msg.content === 'string') {
      total += estimateTokenCount(msg.content)
    } else if (Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if (typeof part === 'object' && part !== null && 'text' in part) {
          total += estimateTokenCount(String(part.text))
        } else if (
          typeof part === 'object' &&
          part !== null &&
          'type' in part &&
          part.type === 'image'
        ) {
          // 图片约 1000 token
          total += 1000
        }
      }
    }
  }
  return total
}
