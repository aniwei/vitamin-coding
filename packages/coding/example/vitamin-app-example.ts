import { createVitamin } from '../src'

const vitamin = createVitamin({
  port: 3000,
  inspect: true,
  logger: {
    name: 'vitamin-app',
    level: 'trace',
    destination: 'vitamin-app.log',
  },
  model: {
    id: 'claude-sonnet-4-20250514',
    provider: 'anthropic',
    api: 'anthropic',
    contextWindow: 200_000,
  },
  systemPrompt: 'You are a helpful coding assistant.',
})

vitamin.start().then(async () => {
  // 创建多个独立会话
  const sessionA = await vitamin.createSession({ id: 'session-a' })
  const sessionB = await vitamin.createSession({ id: 'session-b' })

  // 监听会话事件
  sessionA.onSessionEvent((event) => {
    console.log('[Session A]', event.type)
  })

  // 每个会话独立运行 Agent
  await sessionA.prompt('List all .ts files in src/')
  await sessionB.prompt('Explain the architecture of this project')

  // 列出所有活跃会话
  const sessions = vitamin.listSessions()
  console.log('Active sessions:', sessions.length)

  // 通过 ID 检索会话
  const found = vitamin.getSession('session-a')
  console.log('Found session:', found?.id)

  // Steering: 在 Agent 工具执行间隙注入消息
  // sessionA.steer('Also check for unused exports')

  // FollowUp: 在 Agent 完成后追加消息
  // sessionA.followUp('Now summarize the results')

  // 移除会话
  vitamin.removeSession('session-b')
  console.log('After removal:', vitamin.listSessions().length)
})