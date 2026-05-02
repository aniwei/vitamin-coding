// URL 验证 + SSRF 防护

import { ToolError } from '@x-mars/shared'

const BLOCKED_PROTOCOLS = new Set(['file:', 'ftp:', 'data:', 'javascript:'])

const BLOCKED_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '[::1]',
  '::1',
  'metadata.google.internal',
  '169.254.169.254',
])

function isPrivateIP(hostname: string): boolean {
  // IPv4 私有地址段
  if (hostname.startsWith('10.')) {
    return true
  }
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)) {
    return true
  }
  if (hostname.startsWith('192.168.')) {
    return true
  }

  // 链路本地地址
  if (hostname.startsWith('169.254.')) {
    return true
  }

  // 回射地址
  if (hostname.startsWith('127.')) {
    return true
  }

  // IPv6 私有/回射地址
  if (hostname === '::1' || hostname === '[::1]') {
    return true
  }
  if (/^fe80:/i.test(hostname)) {
    return true
  }
  if (/^fc00:/i.test(hostname)) {
    return true
  }
  if (/^fd[0-9a-f]{2}:/i.test(hostname)) {
    return true
  }

  return false
}

export function validateUrl(raw: string): URL {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new ToolError(`Invalid URL: ${raw}`, {
      code: 'TOOL_WEB_INVALID_URL',
      metadata: { url: raw },
    })
  }

  if (BLOCKED_PROTOCOLS.has(url.protocol)) {
    throw new ToolError(`Blocked protocol: ${url.protocol}`, {
      code: 'TOOL_WEB_BLOCKED_PROTOCOL',
      metadata: { url: raw, protocol: url.protocol },
    })
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ToolError(`Unsupported protocol: ${url.protocol}`, {
      code: 'TOOL_WEB_UNSUPPORTED_PROTOCOL',
      metadata: { url: raw, protocol: url.protocol },
    })
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, '')

  if (BLOCKED_HOSTS.has(hostname)) {
    throw new ToolError(`Blocked host: ${hostname}`, {
      code: 'TOOL_WEB_BLOCKED_HOST',
      metadata: { url: raw, hostname },
    })
  }

  if (isPrivateIP(hostname)) {
    throw new ToolError(`Blocked private IP: ${hostname}`, {
      code: 'TOOL_WEB_BLOCKED_PRIVATE_IP',
      metadata: { url: raw, hostname },
    })
  }

  return url
}
