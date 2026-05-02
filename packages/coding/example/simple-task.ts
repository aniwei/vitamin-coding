/**
 * 例 1：简单任务 —— "读取 package.json 并告诉我版本号"
 *
 * 对应 README 中的简单任务完整流程。
 * 使用 XMarsApp 容器 + runPrintMode 跑通：
 *   createXMars → start → createSession → prompt → stop
 *
 * 使用 GitHub Copilot 作为 LLM provider（从 ~/.config/x-mars/auth.json 读取凭据）。
 */

import { createXMars, runPrintMode } from '../src'

const modelId = process.env.CODING_EXAMPLE_MODEL_ID ?? 'github-copilot/gpt-4o'

async function main() {
  const xMars = createXMars({
    port: 0,
    inspect: false,
    logger: {
      name: 'simple-task',
      level: 'info',
      destination: 'stderr',
    },
    modelId,
    workspaceDir: process.cwd(),
  })

  await xMars.start()
  console.log('[simple-task] XMarsApp started')
  console.log('[simple-task] model:', modelId)

  // 创建 Lead Agent 会话（full 工具预设，lead-guidance 系统提示词）
  const session = await xMars.createSession({ id: 'simple-task-session' })
  console.log('[simple-task] session created:', session.id)

  // Direct 复杂度路由：LLM 判定为单文件无歧义，直接使用 read 工具完成
  const response = await runPrintMode(session, '读取 package.json 并告诉我版本号和依赖列表')

  console.log('\n[simple-task] final response:', response)

  // 收尾
  const sessions = xMars.listSessions()
  console.log('[simple-task] active sessions:', sessions.length)

  await xMars.removeSession('simple-task-session')
  await xMars.stop()
  console.log('[simple-task] done')
}

main().catch((error) => {
  console.error('[simple-task] error:', error)
  process.exitCode = 1
})
