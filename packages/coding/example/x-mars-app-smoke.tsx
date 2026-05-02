/**
 * XMarsApp 冒烟测试
 *
 * 验证 createXMars → start → createSession → prompt → stop 完整生命周期
 */

import { createXMars, getLastAssistantText } from '../src'

async function main() {
  const xMars = createXMars({
    port: 3000,
    inspect: false,
    logger: {
      name: 'x-mars-app-smoke',
      level: 'info',
      destination: 'x-mars-app-smoke.log',
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

  await xMars.start()
  console.log('X-Mars smoke: started')

  // 验证会话完整生命周期
  const session = await xMars.createSession({ id: 'smoke-session' })
  console.log('X-Mars smoke: session created:', session.id)

  await session.prompt('Say "smoke test passed" and nothing else.')
  const response = getLastAssistantText(session.session.messages())
  console.log('X-Mars smoke: response:', response)

  // 验证会话查询
  const sessions = xMars.listSessions()
  console.log('X-Mars smoke: active sessions:', sessions.length)

  const found = xMars.getSession('smoke-session')
  console.log('X-Mars smoke: found session:', found?.id)

  // 验证会话移除
  await xMars.removeSession('smoke-session')
  console.log('X-Mars smoke: sessions after removal:', xMars.listSessions().length)

  await xMars.stop()
  console.log('X-Mars smoke: stopped')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
