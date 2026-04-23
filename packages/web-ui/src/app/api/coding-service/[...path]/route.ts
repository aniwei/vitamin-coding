/**
 * Proxy route: /api/coding-service/:path* → @vitamin/service
 *
 * Forwards all HTTP methods to the coding service, avoiding browser CORS issues.
 * The browser talks only to Next.js (:3000); Next.js forwards server-side.
 *
 * e.g. GET /api/coding-service/api/sessions → GET http://localhost:8080/api/sessions
 */

import { type NextRequest, NextResponse } from 'next/server'

const SERVICE_ORIGIN =
  process.env['CODING_SERVICE_URL'] ??
  process.env['NEXT_PUBLIC_CODING_SERVICE_URL'] ??
  'http://localhost:8080'

async function proxy(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params
  const upstreamPath = '/' + path.join('/')

  const url = new URL(upstreamPath, SERVICE_ORIGIN)
  // Forward query string
  req.nextUrl.searchParams.forEach((value, key) => {
    url.searchParams.set(key, value)
  })

  const headers = new Headers(req.headers)
  // Remove headers that should not be forwarded
  headers.delete('host')

  const body =
    req.method !== 'GET' && req.method !== 'HEAD'
      ? await req.arrayBuffer()
      : undefined

  try {
    const upstream = await fetch(url.toString(), {
      method: req.method,
      headers,
      body: body ? Buffer.from(body) : undefined,
    })

    const responseHeaders = new Headers(upstream.headers)
    // Strip encoding headers — Next.js handles its own encoding
    responseHeaders.delete('content-encoding')
    responseHeaders.delete('transfer-encoding')

    return new NextResponse(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    })
  } catch (err) {
    return NextResponse.json(
      { error: 'coding service unavailable', detail: String(err) },
      { status: 502 }
    )
  }
}

export const GET = proxy
export const POST = proxy
export const PUT = proxy
export const PATCH = proxy
export const DELETE = proxy
