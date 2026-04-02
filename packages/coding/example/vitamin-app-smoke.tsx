/**
 * VitaminApp 冒烟测试
 *
 * 验证 createVitamin → start → createSession → prompt → stop 完整生命周期
 */

import { createVitamin, getLastAssistantText } from '../src'

async function main() {
  const vitamin = createVitamin({
    port: 3000,
    inspect: false,
    logger: {
      name: 'vitamin-app-smoke',
      level: 'info',
      destination: 'vitamin-app-smoke.log',
    },
    model: {
      id: 'claude-sonnet-4-20250514',
      name: 'Claude Sonnet 4',
      provider: 'anthropic',
      api: 'anthropic-messages',
      baseUrl: 'https://api.anthropic.com',
      reasoning: true,
      input: ['text'],
      cost: {
        input: 3,
        output: 15,
        cacheRead: 0.3,
        cacheWrite: 3.75,
      },
      contextWindow: 200_000,
      maxOutputTokens: 8_192,
    },
  })

  await vitamin.start()
  console.log('Vitamin smoke: started')

  // 验证会话完整生命周期
  const session = await vitamin.createSession({ id: 'smoke-session' })
  console.log('Vitamin smoke: session created:', session.id)

  await session.prompt('Say "smoke test passed" and nothing else.')
  const response = getLastAssistantText(session.session.messages())
  console.log('Vitamin smoke: response:', response)

  // 验证会话查询
  const sessions = vitamin.listSessions()
  console.log('Vitamin smoke: active sessions:', sessions.length)

  const found = vitamin.getSession('smoke-session')
  console.log('Vitamin smoke: found session:', found?.id)

  // 验证会话移除
  await vitamin.removeSession('smoke-session')
  console.log('Vitamin smoke: sessions after removal:', vitamin.listSessions().length)

  await vitamin.stop()
  console.log('Vitamin smoke: stopped')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
