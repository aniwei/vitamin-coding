/**
 * AuthStore 使用示例
 *
 * 覆盖场景：
 *  1. 环境变量自动读取（无需任何配置）
 *  2. 运行时临时注入 key（CLI --api-key 场景）
 *  3. 直接写入并持久化 API key
 *  4. GitHub Copilot OAuth 登录 / 登出
 *  5. 自定义凭据文件路径
 *  6. 通过 VitaminApp 访问 authStore
 */

import { createVitamin } from '../src'
import { createDefaultAuthStore } from '../../ai/src'
import type { OAuthInfo } from '../../ai/src'

async function exampleEnvFallback() {
  const store = createDefaultAuthStore()

  // 检查是否有可用凭据（快速，不触发 OAuth 刷新）
  const hasAnthropicKey = await store.hasCredential('anthropic')
  console.log('hasCredential(anthropic):', hasAnthropicKey)

  // 按优先级解析 key（cache → env var → null）
  const key = await store.getCredentialKey('anthropic')
  console.log('anthropic key:', key ? `${key.slice(0, 8)}...` : null)
}

async function exampleTemporaryKey() {
  const store = createDefaultAuthStore()

  await store.ensureInitialized()

  // 注入临时 key（不调用 save()，不落盘）
  store.setCredentialKey('openai', 'sk-temporary-in-memory-only')

  const key = await store.getCredentialKey('openai')
  console.log('temporary key resolved:', key)

  // 需要撤销时移除（同样不调用 save()，不影响磁盘）
  store.remove('openai')
}

async function examplePersistApiKey() {
  const store = createDefaultAuthStore()

  await store.ensureInitialized() // 确保加载文件（可选，setCredentialKey 内部会自动调用）

  // 写入内存缓存，标记为"待持久化"
  store.setCredentialKey('anthropic', 'sk-ant-xxxxx')

  console.log('isDirty before save:', store.isDirty) // true

  // 写入磁盘（自动创建目录，chmod 0o600）
  await store.save()

  console.log('isDirty after save:', store.isDirty) // false

  // 验证：下次启动读取文件时会自动加载
  const key = await store.getCredentialKey('anthropic')
  console.log('persisted key:', key ? `${key.slice(0, 8)}...` : null)
}

async function exampleCustomPath() {
  const projectStore = createDefaultAuthStore({
    path: '/tmp/my-project/.vitamin/auth.json',
    env: {
      'openai': 'MY_PROJECT_OPENAI_KEY', // 覆盖默认环境变量名
    },
  })

  await projectStore.ensureInitialized()

  projectStore.setCredentialKey('openai', 'sk-project-specific-key')
  await projectStore.save()
  console.log('project auth saved to:', projectStore.path)
}

async function exampleVitaminAppAuth() {
  const app = createVitamin({
    port: 3000,
    inspect: false,
    logger: {
      name: 'auth-example',
      level: 'info',
      destination: 'stdout',
    },
    model: {
      id: 'claude-sonnet-4-20250514',
      name: 'Claude Sonnet 4',
      provider: 'anthropic',
      api: 'anthropic-messages',
      baseUrl: 'https://api.anthropic.com',
      reasoning: false,
      input: ['text'],
      cost: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
      contextWindow: 200_000,
      maxOutputTokens: 8_192,
    },
  })

  // app.auth 是自动创建的 AuthStore 实例（带默认 env 映射）
  // app.providerRegistry 已绑定该 auth 作为主要凭据来源

  // CLI 临时注入 key（不调用 save()，进程退出即丢弃）
  await app.auth.ensureInitialized()
  app.auth.setCredentialKey('anthropic', process.env.ANTHROPIC_API_KEY ?? 'sk-placeholder')

  // 检查 anthropic 是否有凭据（会被 ProviderRegistry 的 resolveAccessKey 调用）
  const ready = await app.auth.hasCredential('anthropic')
  console.log('anthropic ready:', ready)

  // 对于 github-copilot，若尚未登录可触发 OAuth 流程：
  const copilotReady = await app.auth.hasCredential('github-copilot')
  if (!copilotReady) {
    console.log('github-copilot 未配置，可调用 app.auth.login("github-copilot", ...) 启动登录')
  }

  await app.auth.login('github-copilot', {
    onAuth: ({ url, code }: OAuthInfo) => {
      console.log(`请访问 ${url} 并输入设备码：${code}`)
    },
    onPrompt: async () => '',
  })

  await app.start()
  console.log('VitaminApp started with authStore path:', app.auth.path)
  await app.stop()
}

// ─── 运行所有示例 ─────────────────────────────────────────────────────────────

async function main() {
  console.log('\n=== 场景 1：环境变量自动读取 ===')
  await exampleEnvFallback()

  console.log('\n=== 场景 2：运行时临时注入 key ===')
  await exampleTemporaryKey()

  console.log('\n=== 场景 3：持久化 API key ===')
  await examplePersistApiKey()

  console.log('\n=== 场景 5：自定义凭据文件路径 ===')
  await exampleCustomPath()

  console.log('\n=== 场景 6：通过 VitaminApp 访问 authStore ===')
  await exampleVitaminAppAuth()
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
