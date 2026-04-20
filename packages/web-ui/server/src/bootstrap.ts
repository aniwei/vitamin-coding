/**
 * 启动流程（替代 Next.js 的 src/instrumentation.ts）：
 * 1. 配置 HTTP(S) 代理
 * 2. 运行数据库迁移
 * 3. 初始化 MCP 管理器
 */
export async function bootstrap() {
  const proxyUrl =
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy

  if (proxyUrl) {
    const { ProxyAgent, setGlobalDispatcher } = await import('undici')
    console.log(`[bootstrap] using proxy: ${proxyUrl}`)
    setGlobalDispatcher(new ProxyAgent(proxyUrl))
  }

  const IS_VERCEL_ENV = !!(
    process.env.VERCEL ||
    process.env.VERCEL_ENV ||
    process.env.NEXT_PUBLIC_VERCEL_ENV
  )

  if (!IS_VERCEL_ENV) {
    const { runMigrate } = await import('../../src/lib/db/pg/migrate.pg')
    await runMigrate().catch((e: unknown) => {
      console.error('[bootstrap] DB migration failed:', e)
      process.exit(1)
    })

    const { initMCPManager } = await import('../../src/lib/ai/mcp/mcp-manager')
    await initMCPManager()
  }
}
