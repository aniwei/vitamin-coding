import { serve } from '@hono/node-server'
import { bootstrap } from './bootstrap'
import { createApp } from './app'
import { env } from './env'

async function main() {
  await bootstrap()

  const app = createApp()
  const port = env.PORT

  serve({ fetch: app.fetch, port }, (info) => {
    console.log(`[server] listening on http://localhost:${info.port}`)
  })
}

void main().catch((err) => {
  console.error('[server] fatal start error:', err)
  process.exit(1)
})
