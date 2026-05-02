/**
 * XMarsApp 完整使用示例
 *
 * 覆盖场景：
 *  1. 创建 XMarsApp 实例（基本配置 + devtools 调试）
 *  2. 会话管理（创建 / 检索 / 列出 / 移除 / Fork）
 *  3. 会话事件监听
 *  4. Steering / FollowUp — Agent 执行中注入消息
 *  5. Compaction — 会话消息压缩
 *  6. 运行模式（print / json / rpc / interactive）
 *  7. PromptManager 与 HookRegistry
 *  8. 磁盘持久化会话 & 远程会话
 */

import {
  createXMars,
  runPrintMode,
  runJsonMode,
  runRpcMode,
  InteractiveMode,
  getLastAssistantText,
} from '../src'
import type { XMarsAppOptions } from '../src'

// ─── 通用模型配置 ─────────────────────────────────────────────────────────────

const baseOptions = {
  port: 3000,
  inspect: false,
  logger: {
    name: 'x-mars-example',
    level: 'info',
    destination: 'stdout',
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
} satisfies XMarsAppOptions

// ─── 场景 1：基本启动 / 停止 ──────────────────────────────────────────────────

async function exampleBasicLifecycle() {
  const xMars = createXMars(baseOptions)

  await xMars.start()
  console.log('XMarsApp started')

  // 通过 XMarsContext 接口访问核心子系统
  console.log('workspaceDir:', xMars.workspaceDir)
  console.log('available tools:', xMars.tools.length)
  console.log('model registry models:', xMars.modelRegistry)

  await xMars.stop()
}

// ─── 场景 2：会话管理 ─────────────────────────────────────────────────────────

async function exampleSessionManagement() {
  const xMars = createXMars(baseOptions)
  await xMars.start()

  try {
    // 创建会话（可指定 id、agentName、model 覆盖等）
    const sessionA = await xMars.createSession({ id: 'session-a' })
    const sessionB = await xMars.createSession({ id: 'session-b' })
    console.log('Created sessions:', sessionA.id, sessionB.id)

    // 列出所有会话
    const sessions = xMars.listSessions()
    console.log('Active sessions:', sessions.map((s) => `${s.id}(${s.status})`).join(', '))

    // 通过 ID 检索
    const found = xMars.getSession('session-a')
    console.log('Found session:', found?.id)

    // Fork 会话（拷贝消息历史到新会话）
    const forked = await xMars.forkSession('session-a', 'session-a-fork')
    console.log('Forked session:', forked?.id)

    // 移除会话
    await xMars.removeSession('session-b')
    console.log('After removal:', xMars.listSessions().length, 'sessions')
  } finally {
    await xMars.stop()
  }
}

// ─── 场景 3：会话事件监听 ──────────────────────────────────────────────────────

async function exampleSessionEvents() {
  const xMars = createXMars(baseOptions)
  await xMars.start()

  try {
    const session = await xMars.createSession()

    // AgentSession 继承 TypedEventEmitter，支持类型安全的事件监听
    session.on('prompt_start', (sessionId: string, prompt: string) => {
      console.log(`[${sessionId}] prompt started: ${prompt.slice(0, 50)}...`)
    })

    session.on('prompt_end', (sessionId: string) => {
      console.log(`[${sessionId}] prompt ended`)
    })

    session.on('error', (sessionId: string, error: Error) => {
      console.error(`[${sessionId}] error:`, error.message)
    })

    await session.prompt('Say hello in 10 words or less.')

    const response = getLastAssistantText(session.session.messages())
    console.log('Response:', response)
  } finally {
    await xMars.stop()
  }
}

// ─── 场景 4：Steering / FollowUp ─────────────────────────────────────────────

async function exampleSteerAndFollowUp() {
  const xMars = createXMars(baseOptions)
  await xMars.start()

  try {
    const session = await xMars.createSession()

    // 在 Agent 执行过程中（工具调用间隙）注入 steer 消息
    // steer: 插入到当前 turn 的工具结果之前
    // followUp: 排队在当前 turn 结束后立即执行
    //
    // 注意：只能在 session.isExecuting === true 时调用，
    // 或使用 streamingBehavior 选项让 prompt() 自动路由

    // 方式 A：直接调用
    // session.steer('Also check for unused exports')
    // session.followUp('Now summarize the results')

    // 方式 B：通过 prompt() 的 streamingBehavior 选项
    // await session.prompt('Also check tests', { streamingBehavior: 'steer' })
    // await session.prompt('Summarize', { streamingBehavior: 'followUp' })

    await session.prompt('List all TypeScript files in the project')
  } finally {
    await xMars.stop()
  }
}

// ─── 场景 5：会话压缩（Compaction） ──────────────────────────────────────────

async function exampleCompaction() {
  const xMars = createXMars(baseOptions)
  await xMars.start()

  try {
    const session = await xMars.createSession()

    // 模拟多轮对话
    await session.prompt('What is TypeScript?')
    await session.prompt('How does type inference work?')
    await session.prompt('Explain generics.')

    const beforeCount = session.session.messages().length
    console.log('Messages before compaction:', beforeCount)

    // compact(summary, compactedCount) — 将前 N 条消息替换为摘要
    await session.compact('Discussed TypeScript basics: types, inference, generics.', 4)

    const afterCount = session.session.messages().length
    console.log('Messages after compaction:', afterCount)
  } finally {
    await xMars.stop()
  }
}

// ─── 场景 6：运行模式 ─────────────────────────────────────────────────────────

async function exampleRunModes() {
  const xMars = createXMars(baseOptions)
  await xMars.start()

  try {
    // Print 模式 — 直接输出到 stdout
    const printSession = await xMars.createSession()
    const text = await runPrintMode(printSession, 'What is 2+2?')
    console.log('Print mode result:', text)

    // JSON 模式 — 返回结构化结果
    const jsonSession = await xMars.createSession()
    const result = await runJsonMode(jsonSession, 'Explain monads in one sentence.')
    console.log('JSON mode result:', JSON.stringify(result, null, 2))

    // RPC 模式 — 请求/响应协议
    const rpcSession = await xMars.createSession()
    const rpcResult = await runRpcMode(rpcSession, {
      id: 'req-1',
      method: 'prompt',
      params: { text: 'Hello' },
    })
    console.log('RPC result:', rpcResult)

    // RPC 状态查询
    const statusResult = await runRpcMode(rpcSession, { id: 'req-2', method: 'status' })
    console.log('RPC status:', statusResult)

    // Interactive 模式 — 适用于 REPL
    const interactiveSession = await xMars.createSession()
    const interactive = new InteractiveMode(interactiveSession)
    const response = await interactive.handleInput('Hello!')
    console.log('Interactive result:', response)
  } finally {
    await xMars.stop()
  }
}

// ─── 场景 7：Devtools 调试 ────────────────────────────────────────────────────

async function exampleDevtools() {
  const xMars = createXMars({
    ...baseOptions,
    inspect: true, // 启用 devtools
    port: 3001, // devtools 端口
    logger: {
      ...baseOptions.logger,
      level: 'trace', // 调试时建议使用 trace 级别
      destination: 'x-mars-debug.log',
    },
  })

  await xMars.start()
  console.log('XMarsApp started with devtools enabled')

  try {
    const session = await xMars.createSession()
    // devtools 会自动在断点处暂停（prompt_before / context_build / turn 等）
    await session.prompt('Analyze the codebase structure')
  } finally {
    await xMars.stop()
  }
}

// ─── 场景 8：磁盘持久化会话 ──────────────────────────────────────────────────

async function exampleDiskSessions() {
  const xMars = createXMars({
    ...baseOptions,
    sessionDir: '/tmp/x-mars-sessions', // 会话持久化到磁盘
  })

  await xMars.start()

  try {
    const session = await xMars.createSession({ id: 'persistent-session' })
    await session.prompt('Remember this: the secret word is "banana".')
    console.log('Session persisted to disk. ID:', session.id)
    // 下次启动时，同一 sessionDir 会自动恢复会话
  } finally {
    await xMars.stop()
  }
}

// ─── 运行所有示例 ─────────────────────────────────────────────────────────────

async function main() {
  console.log('\n=== 场景 1：基本启动 / 停止 ===')
  await exampleBasicLifecycle()

  console.log('\n=== 场景 2：会话管理 ===')
  await exampleSessionManagement()

  console.log('\n=== 场景 3：会话事件监听 ===')
  await exampleSessionEvents()

  console.log('\n=== 场景 4：Steering / FollowUp ===')
  await exampleSteerAndFollowUp()

  console.log('\n=== 场景 5：会话压缩 ===')
  await exampleCompaction()

  console.log('\n=== 场景 6：运行模式 ===')
  await exampleRunModes()

  console.log('\n=== 场景 7：Devtools 调试 ===')
  await exampleDevtools()

  console.log('\n=== 场景 8：磁盘持久化会话 ===')
  await exampleDiskSessions()
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
