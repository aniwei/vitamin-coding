/**
 * 例 2：复杂任务 —— "重构 session 模块"
 *
 * 对应 README 中的复杂任务完整流程。
 * 使用 VitaminApp 容器跑通 Full Pipeline：
 *   Clarify → Plan → Execute (task_delegate) → Verify (review_call) → Conclude
 *
 * Lead Agent 拥有 full 工具预设（含 task_delegate / review_call / agent_task 等编排工具），
 * 会自动按 Complexity Routing 进入多步编排流程，派发子任务给 sub-agent 执行。
 *
 * 使用 GitHub Copilot 作为 LLM provider（从 ~/.config/vitamin/auth.json 读取凭据）。
 */

import { createVitamin, getLastAssistantText } from '../src'
import { prepareSandboxWorkspace } from './sandbox-workspace'

const modelId = process.env.CODING_EXAMPLE_MODEL_ID ?? 'github-copilot/gemini-2.5-pro'
const prompt = process.env.CODING_EXAMPLE_PROMPT ?? '在 app 创建一个 vite react typescript 项目'

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback
  }

  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

const maxToolTurns = parsePositiveInt(process.env.CODING_EXAMPLE_MAX_TOOL_TURNS, 20)

async function main() {
  const sandbox = await prepareSandboxWorkspace(process.cwd())

  const vitamin = createVitamin({
    port: 0,
    inspect: false,
    logger: {
      name: 'complex-task',
      level: 'info',
      destination: 'stderr',
    },
    modelId,
    maxToolTurns,
    workspaceDir: sandbox.workspaceDir,
  })

  try {
    await vitamin.start()
    console.log('[complex-task] VitaminApp started')
    console.log('[complex-task] model:', modelId)
    console.log('[complex-task] maxToolTurns:', maxToolTurns)
    console.log('[complex-task] workspace:', sandbox.workspaceDir)
    console.log('[complex-task] workspaceSource:', sandbox.source)

    // 创建 Lead Agent 会话
    const session = await vitamin.createSession({ id: 'complex-task-session' })
    console.log('[complex-task] session created:', session.id)

    // 监听事件，跟踪执行过程
    session.on('prompt_start', (sessionId: string) => {
      console.log(`[complex-task] prompt_start: ${sessionId}`)
    })
    session.on('prompt_end', (sessionId: string) => {
      console.log(`[complex-task] prompt_end: ${sessionId}`)
    })

    // Full Pipeline 复杂度路由：Lead Agent 进入 Clarify → Plan → Execute → Verify → Conclude
    // 会使用 task_delegate 派发子任务、review_call 请求 review
    await session.prompt(prompt)

    const response = getLastAssistantText(session.session.messages())
    console.log('\n[complex-task] final response:', response.slice(0, 500))

    // 打印会话消息统计
    const messages = session.session.messages()
    console.log('[complex-task] total messages:', messages.length)

    let toolCallCount = 0
    for (const m of messages) {
      if ('role' in m && m.role === 'assistant' && Array.isArray(m.content)) {
        for (const p of m.content) {
          if ('type' in p && p.type === 'tool_call') {
            toolCallCount++
          }
        }
      }
    }
    console.log('[complex-task] total tool calls:', toolCallCount)

    // 收尾
    await vitamin.removeSession('complex-task-session')
    console.log('[complex-task] done')
  } finally {
    await vitamin.stop().catch(() => {})
    await sandbox.cleanup()
  }
}

main().catch((error) => {
  console.error('[complex-task] error:', error)
  process.exitCode = 1
})
