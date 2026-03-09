// 字符串工具：截断、slug 化、token 估算
export const CHARS_PER_TOKEN = 4

// 将字符串截断到 maxLength 个字符，截断时追加后缀
export function truncate(input: string, maxLength: number, suffix = '...'): string {
  if (input.length <= maxLength) return input
  return input.slice(0, maxLength - suffix.length) + suffix
}

// 将字符串转换为 URL 安全的 slug
// 示例：slugify('Hello World!') => 'hello-world'
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

// 粗略 token 估算，用于 LLM 上下文管理
export function estimateTokens(text: string): number {
  const length = text?.length ?? 0
  return Math.ceil(length / CHARS_PER_TOKEN)
}

// 将文本截断至大约不超过给定的 token 预算
// 考虑 CJK 字符占比，动态调整字符限制
export function truncateToTokenBudget(
  text: string,
  maxTokens: number,
  suffix = '\n[truncated]',
): string {
  const estimated = estimateTokens(text)
  if (estimated <= maxTokens) return text

  // 根据 CJK 字符占比动态计算每个 token 的平均字符数
  // 英文约 4 字符/token，CJK 约 2 字符/token
  const cjkCount = countCjkCharacters(text)
  const cjkRatio = text.length > 0 ? cjkCount / text.length : 0
  const charsPerToken = 4 - cjkRatio * 2
  const roughCharLimit = Math.ceil(maxTokens * charsPerToken)
  return truncate(text, roughCharLimit, suffix)
}

function countCjkCharacters(text: string): number {
  let count = 0
  for (const char of text) {
    const code = char.codePointAt(0)
    if (code === undefined) continue
    if (
      (code >= 0x4e00 && code <= 0x9fff) || // CJK 统一汉字
      (code >= 0x3400 && code <= 0x4dbf) || // CJK 扩展 A
      (code >= 0x3000 && code <= 0x303f) || // CJK 符号
      (code >= 0x3040 && code <= 0x309f) || // 平假名
      (code >= 0x30a0 && code <= 0x30ff) || // 片假名
      (code >= 0xac00 && code <= 0xd7af) // 韩文
    ) {
      count++
    }
  }
  return count
}
