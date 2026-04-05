// URL 验证 + SSRF 防护

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
  // IPv4 private ranges
  if (/^10\./.test(hostname)) return true
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)) return true
  if (/^192\.168\./.test(hostname)) return true

  // Link-local
  if (/^169\.254\./.test(hostname)) return true

  // Loopback
  if (/^127\./.test(hostname)) return true

  // IPv6 private/loopback
  if (hostname === '::1' || hostname === '[::1]') return true
  if (/^fe80:/i.test(hostname)) return true
  if (/^fc00:/i.test(hostname)) return true
  if (/^fd[0-9a-f]{2}:/i.test(hostname)) return true

  return false
}

export function validateUrl(raw: string): URL {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new Error(`Invalid URL: ${raw}`)
  }

  if (BLOCKED_PROTOCOLS.has(url.protocol)) {
    throw new Error(`Blocked protocol: ${url.protocol}`)
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`Unsupported protocol: ${url.protocol}`)
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, '')

  if (BLOCKED_HOSTS.has(hostname)) {
    throw new Error(`Blocked host: ${hostname}`)
  }

  if (isPrivateIP(hostname)) {
    throw new Error(`Blocked private IP: ${hostname}`)
  }

  return url
}
