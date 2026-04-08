/**
 * 例: Devtools + Web UI 服务
 *
 * DevtoolsService 使用 Worker 线程运行独立 HTTP/WS 服务，
 * 负责断点暂停/恢复通信（主线程通过异步 Promise 等待恢复指令）。
 *
 *   - 指定 port: devtools inspector 固定绑定到该端口
 *   - 不指定 port: 自动分配随机端口（内部使用，不对外暴露）
 *
 * 本例: devtools on :9229, Web UI service on :8080
 *   tsx example/devtools-service.ts
 */

import { createVitamin } from '@vitamin/coding'
import { createCodingService } from '../src/coding-service'

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
    cors: 'http://127.0.0.1:5173',
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
