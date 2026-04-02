/**
 * 例: Devtools + Web UI 共享端口服务
 *
 * 演示 CodingService 复用 devtools Worker HTTP 端口的两种方式:
 *
 *   方式 A (推荐): CodingService 作为主服务器，devtools 挂载路由
 *     - CodingService 拥有 HTTP server，devtools 以 noServer 模式运行
 *     - 单端口同时提供 web-ui API + devtools debug API
 *
 *   方式 B: 双端口，各自独立运行
 *     - CodingService on :8080 (web-ui)
 *     - DevtoolsService on :9229 (debug inspector)
 *
 * 本例展示方式 B (更简单，已有功能即可):
 *   tsx example/devtools-service.ts
 */

import { createVitamin } from '../src'
import { createCodingService } from '@vitamin/service'

const modelId = process.env.CODING_EXAMPLE_MODEL_ID ?? 'github-copilot/gpt-4o'

async function main() {
  const vitamin = createVitamin({
    port: 9229,  // devtools inspector port
    inspect: true,
    logger: {
      name: 'devtools-service',
      level: 'info',
      destination: 'stderr',
    },
    modelId,
    workspaceDir: process.cwd(),
  })

  await vitamin.start()
  console.log('[devtools-service] VitaminApp started with devtools on :9229')

  // Web UI service on a separate port
  const service = createCodingService(vitamin, {
    port: 8080,
    host: '127.0.0.1',
    corsOrigin: 'http://localhost:5173',
  })

  const originalCreate = vitamin.createSession.bind(vitamin)
  vitamin.createSession = async (options) => {
    const session = await originalCreate(options)
    service.attachSession(session)
    return session
  }

  await service.start()
  console.log('[devtools-service] Web UI service on http://127.0.0.1:8080')
  console.log('[devtools-service] Devtools inspector on ws://127.0.0.1:9229/{id}/inspect')

  // Graceful shutdown
  const shutdown = async () => {
    console.log('\n[devtools-service] shutting down...')
    await service.stop()
    await vitamin.stop()
    process.exit(0)
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

main().catch((err) => {
  console.error('[devtools-service] fatal:', err)
  process.exit(1)
})
