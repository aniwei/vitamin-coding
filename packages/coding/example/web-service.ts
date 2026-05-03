/**
 * 例: Coding Service -- 启动 HTTP+WebSocket 服务供客户端接入
 *
 * 启动步骤：
 *   1. tsx example/web-service.ts
 *   2. 客户端连接 http://localhost:8080 或 ws://localhost:8080/ws
 *
 * 服务端口: 8080
 *
 * 架构:
 *   XMarsApp (session/agent 运行时)
 *     └─ CodingService (HTTP+WS server)
 *          ├─ /api/chat/*        ← chat HTTP API
 *          ├─ /api/sessions/*    ← session 管理 API
 *          ├─ /api/config/*      ← 配置 API
 *          ├─ /api/health        ← 健康检查
 *          └─ /ws                ← WebSocket 实时事件流
 */

import { createXMars } from '../src'
import { createCodingService } from '@x-mars/service'

const modelId = process.env.CODING_EXAMPLE_MODEL_ID ?? 'github-copilot/gpt-4o'
const SERVICE_PORT = Number(process.env.PORT) || 8080

async function main() {
  // 1. 创建 XMarsApp 容器
  const xMars = createXMars({
    port: 0, // devtools port (0 = disabled)
    inspect: false,
    logger: {
      name: 'web-service',
      level: 'info',
      destination: 'stderr',
    },
    modelId,
    workspaceDir: process.cwd(),
  })

  await xMars.start()
  console.log('[web-service] XMarsApp started')

  // 2. 创建 CodingService (HTTP + WebSocket)
  const service = createCodingService(xMars, {
    port: SERVICE_PORT,
    host: '127.0.0.1',
    corsOrigin: '*',
  })

  // 3. 自动 attach 新建会话的事件桥
  const originalCreate = xMars.createSession.bind(xMars)
  xMars.createSession = async (options) => {
    const session = await originalCreate(options)
    service.attachSession(session)
    return session
  }

  await service.start()
  console.log(`[web-service] HTTP service on http://127.0.0.1:${SERVICE_PORT}`)
  console.log(`[web-service] WebSocket on ws://127.0.0.1:${SERVICE_PORT}/ws`)
  console.log(`[web-service] Connect an HTTP/WebSocket client to this service`)

  // Graceful shutdown
  const shutdown = async () => {
    console.log('\n[web-service] shutting down...')
    await service.stop()
    await xMars.stop()
    process.exit(0)
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

main().catch((err) => {
  console.error('[web-service] fatal:', err)
  process.exit(1)
})
