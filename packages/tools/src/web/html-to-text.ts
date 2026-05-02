// HTML → 纯文本 / Markdown 转换

const HTML_ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
  '&ndash;': '–',
  '&mdash;': '—',
  '&laquo;': '«',
  '&raquo;': '»',
  '&copy;': '©',
  '&reg;': '®',
  '&trade;': '™',
  '&hellip;': '…',
}

function decodeHtmlEntities(text: string): string {
  // 命名实体
  let result = text.replace(/&[a-zA-Z]+;/g, (entity) => {
    return HTML_ENTITIES[entity] ?? entity
  })

  // 十进制数字实体
  result = result.replace(/&#(\d+);/g, (_, code) => {
    const num = parseInt(code, 10)
    return num > 0 && num < 0x10ffff ? String.fromCodePoint(num) : ''
  })

  // 十六进制数字实体
  result = result.replace(/&#x([0-9a-fA-F]+);/g, (_, code) => {
    const num = parseInt(code, 16)
    return num > 0 && num < 0x10ffff ? String.fromCodePoint(num) : ''
  })

  return result
}

export function htmlToText(html: string): string {
  let text = html

  // 1. 移除不可见内容
  text = text.replace(/<script[\s\S]*?<\/script>/gi, '')
  text = text.replace(/<style[\s\S]*?<\/style>/gi, '')
  text = text.replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
  text = text.replace(/<svg[\s\S]*?<\/svg>/gi, '')
  text = text.replace(/<!--[\s\S]*?-->/g, '')

  // 2. 语义化转换
  text = text.replace(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi, '\n\n## $1\n\n')
  text = text.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '\n• $1')
  text = text.replace(/<br\s*\/?>/gi, '\n')
  text = text.replace(/<\/p>/gi, '\n\n')
  text = text.replace(/<\/div>/gi, '\n')
  text = text.replace(/<\/tr>/gi, '\n')
  text = text.replace(/<td[^>]*>/gi, '\t')
  text = text.replace(/<th[^>]*>/gi, '\t')
  text = text.replace(/<hr[^>]*\/?>/gi, '\n---\n')
  text = text.replace(/<\/blockquote>/gi, '\n')
  text = text.replace(/<blockquote[^>]*>/gi, '\n> ')

  // 3. 提取链接文本
  text = text.replace(/<a[^>]+href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, '$2 ($1)')

  // 4. 提取图片 alt 文本
  text = text.replace(/<img[^>]+alt="([^"]*)"[^>]*\/?>/gi, '[$1]')

  // 5. 剥离剩余标签
  text = text.replace(/<[^>]+>/g, '')

  // 6. 解码 HTML 实体
  text = decodeHtmlEntities(text)

  // 7. 清理空白
  text = text.replace(/\n{3,}/g, '\n\n')
  text = text.replace(/[ \t]+/g, ' ')
  text = text.replace(/^ +/gm, '')
  text = text.trim()

  return text
}

export function htmlToMarkdown(html: string): string {
  let text = html

  // 1. 移除不可见内容
  text = text.replace(/<script[\s\S]*?<\/script>/gi, '')
  text = text.replace(/<style[\s\S]*?<\/style>/gi, '')
  text = text.replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
  text = text.replace(/<svg[\s\S]*?<\/svg>/gi, '')
  text = text.replace(/<!--[\s\S]*?-->/g, '')

  // 2. Markdown 转换
  text = text.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '\n\n# $1\n\n')
  text = text.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '\n\n## $1\n\n')
  text = text.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '\n\n### $1\n\n')
  text = text.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, '\n\n#### $1\n\n')
  text = text.replace(/<h5[^>]*>([\s\S]*?)<\/h5>/gi, '\n\n##### $1\n\n')
  text = text.replace(/<h6[^>]*>([\s\S]*?)<\/h6>/gi, '\n\n###### $1\n\n')

  text = text.replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, '**$1**')
  text = text.replace(/<b[^>]*>([\s\S]*?)<\/b>/gi, '**$1**')
  text = text.replace(/<em[^>]*>([\s\S]*?)<\/em>/gi, '*$1*')
  text = text.replace(/<i[^>]*>([\s\S]*?)<\/i>/gi, '*$1*')
  text = text.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, '`$1`')
  text = text.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, '\n```\n$1\n```\n')

  text = text.replace(/<a[^>]+href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)')
  text = text.replace(/<img[^>]+alt="([^"]*)"[^>]+src="([^"]*)"[^>]*\/?>/gi, '![$1]($2)')
  text = text.replace(/<img[^>]+src="([^"]*)"[^>]*\/?>/gi, '![]($1)')

  text = text.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '\n- $1')
  text = text.replace(/<br\s*\/?>/gi, '\n')
  text = text.replace(/<\/p>/gi, '\n\n')
  text = text.replace(/<hr[^>]*\/?>/gi, '\n---\n')
  text = text.replace(/<\/div>/gi, '\n')
  text = text.replace(/<\/tr>/gi, '\n')
  text = text.replace(/<td[^>]*>/gi, ' | ')
  text = text.replace(/<th[^>]*>/gi, ' | ')
  text = text.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (_, content: string) => {
    return content
      .split('\n')
      .map((line: string) => `> ${line}`)
      .join('\n')
  })

  // 3. 剥离剩余标签
  text = text.replace(/<[^>]+>/g, '')

  // 4. 解码 HTML 实体
  text = decodeHtmlEntities(text)

  // 5. 清理空白
  text = text.replace(/\n{3,}/g, '\n\n')
  text = text.replace(/[ \t]+$/gm, '')
  text = text.trim()

  return text
}
