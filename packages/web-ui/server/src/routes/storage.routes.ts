import { Hono } from 'hono'
import type { AppEnv } from '../app'
import { requireAuth } from '../middleware/require-auth'
import { serverFileStorage, storageDriver } from '../../../src/lib/file-storage'
import { parseCsvPreview, formatCsvPreviewText } from '../../../src/lib/file-ingest/csv'
import { storageKeyFromUrl } from '../../../src/lib/file-storage/storage-utils'

export const storageRoutes = new Hono<AppEnv>()
storageRoutes.use('/*', requireAuth)

// --- helpers ---
async function checkStorage() {
  const { checkStorageAction } = await import('../../../src/app/api/storage/actions')
  return await checkStorageAction()
}

/** POST /api/storage/upload — multipart 上传 */
storageRoutes.post('/upload', async (c) => {
  const storageCheck = await checkStorage()
  if (!storageCheck.isValid) {
    return c.json({ error: storageCheck.error, solution: storageCheck.solution, storageDriver }, 500)
  }
  try {
    const formData = await c.req.formData()
    const file = formData.get('file') as File | null
    if (!file) return c.json({ error: "No file provided. Use 'file' field in FormData." }, 400)
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const result = await serverFileStorage.upload(buffer, {
      filename: file.name,
      contentType: file.type || 'application/octet-stream',
    })
    return c.json({ success: true, key: result.key, url: result.sourceUrl, metadata: result.metadata })
  } catch (error) {
    console.error('Failed to upload file', error)
    return c.json({ error: 'Failed to upload file' }, 500)
  }
})

/** POST /api/storage/upload-url — 生成预签名上传 URL 或降级为直传 */
storageRoutes.post('/upload-url', async (c) => {
  const session = c.get('session')!
  const storageCheck = await checkStorage()
  if (!storageCheck.isValid) {
    return c.json({ error: storageCheck.error, solution: storageCheck.solution, storageDriver }, 500)
  }
  try {
    const body = await c.req.json().catch(() => ({}))
    // If S3 or supports presigned URL
    if (typeof (serverFileStorage as any).getUploadUrl === 'function') {
      const { filename, contentType } = body as { filename?: string; contentType?: string }
      const result = await (serverFileStorage as any).getUploadUrl({
        filename: filename || 'upload',
        contentType: contentType || 'application/octet-stream',
        userId: session.user.id,
      })
      return c.json(result)
    }
    // Fallback
    return c.json({
      directUploadSupported: false,
      fallbackUrl: '/api/storage/upload',
      message: 'Use multipart/form-data upload to fallbackUrl',
    })
  } catch (error) {
    console.error('Failed to generate upload URL', error)
    return c.json({ error: 'Failed to generate upload URL' }, 500)
  }
})

/** POST /api/storage/ingest — CSV 内容预览 */
storageRoutes.post('/ingest', async (c) => {
  let body: { key?: string; url?: string; type?: string; maxRows?: number; maxCols?: number }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON' }, 400)
  }

  const key = body.key || (body.url ? storageKeyFromUrl(body.url) : undefined)
  if (!key) return c.json({ error: "Missing 'key' or 'url'" }, 400)

  const type = body.type || 'auto'
  const isCsv =
    type === 'csv' ||
    /\.(csv)$/i.test(key) ||
    /(^|[?&])contentType=text\/csv(&|$)/i.test(body.url || '')

  if (!isCsv) {
    return c.json(
      { error: 'Unsupported file type for ingest', solution: 'Currently supported: CSV.' },
      400,
    )
  }

  const buf = await serverFileStorage.download(key)
  const preview = parseCsvPreview(buf, {
    maxRows: Math.min(200, Math.max(1, body.maxRows ?? 50)),
    maxCols: Math.min(40, Math.max(1, body.maxCols ?? 12)),
  })
  const text = formatCsvPreviewText(key, preview)
  return c.json({ ok: true, type: 'csv', key, preview, text })
})
