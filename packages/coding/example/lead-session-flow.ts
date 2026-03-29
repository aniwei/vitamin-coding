// ═══════════════════════════════════════════════════════════
// lead-session-flow.ts — 产品级入口示例
// ═══════════════════════════════════════════════════════════
// 演示推荐的 lead session 驱动入口：
//   user prompt → vitamin.lead() → lead session → plan/delegate/review → final answer
//
// 与 agent-flow-no-breakpoints.ts 的区别：
// - 那个示例直接调 dispatcher.dispatch()，是底层链路验收
// - 这个示例用 vitamin.lead()，是产品级用户入口
//
// 运行：
//   pnpm --filter @vitamin/coding run run:example:lead
//   VITAMIN_NONINTERACTIVE=1 pnpm --filter @vitamin/coding run run:example:lead

import { createHookRegistry } from '@vitamin/hooks'
import { createInterface } from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import { createVitamin } from '../src'

import type { Model, OAuthInfo, OAuthPrompt } from '../../ai/src'

// ═══ Model ═══

function createModel(): Model {
  return {
    id: 'github-copilot/gpt-4.1',
    name: 'gpt-4.1',
    api: 'github-copilot',
    provider: 'github-copilot',
    baseUrl: 'https://api.githubcopilot.com',
    reasoning: false,
    input: ['text', 'image'],
    cost: { input: 3, output: 12, cacheRead: 1.5, cacheWrite: 3 },
    contextWindow: 1_048_576,
    maxOutputTokens: 32_768,
  }
}

// ═══ Credential ═══

function isInteractiveLoginAllowed(): boolean {
  return process.env.VITAMIN_NONINTERACTIVE !== '1' && Boolean(input.isTTY) && Boolean(output.isTTY)
}

async function promptUser(prompt: OAuthPrompt): Promise<string> {
  if (!isInteractiveLoginAllowed()) {
    return process.env.VITAMIN_GITHUB_DOMAIN ?? ''
  }
  const rl = createInterface({ input, output })
  try {
    const placeholder = prompt.placeholder ? ` (${prompt.placeholder})` : ''
    const suffix = prompt.allowEmpty ? ' [Enter 使用默认值]' : ''
    return (await rl.question(`${prompt.message}${placeholder}${suffix}: `)).trim()
  } finally {
    rl.close()
  }
}

async function ensureCopilotCredential(vitamin: ReturnType<typeof createVitamin>) {
  const hasCredential = await vitamin.auth.hasCredential('github-copilot')
  if (hasCredential) {
    console.log('github-copilot credential: ready')
    return
  }

  if (!isInteractiveLoginAllowed()) {
    throw new Error(
      'Missing GitHub Copilot credential. Set COPILOT_GITHUB_TOKEN/GH_TOKEN/GITHUB_TOKEN, or rerun interactively.',
    )
  }

  console.log('github-copilot credential: missing, starting device login...')
  await vitamin.auth.login('github-copilot', {
    onPrompt: (prompt: OAuthPrompt) => promptUser(prompt),
    onAuth: ({ url, code, instructions }: OAuthInfo) => {
      console.log('Open:', url)
      console.log(`Code: ${code}`)
      if (instructions) console.log(instructions)
    },
    onProgress: (message: string) => {
      if (message) console.log(`[login] ${message}`)
    },
  })
  console.log('github-copilot credential: login completed')
}

// ═══ Hooks ═══

function createExampleHooks() {
  const hooks = createHookRegistry({ preset: 'none' })

  hooks.on('tool.execute.before', 'lead-tool-before', ({ toolName, args }) => {
    console.log(`  [tool] ${toolName} ${JSON.stringify(args)}`)
  })

  hooks.on('tool.execute.after', 'lead-tool-after', ({ toolName, durationMs }) => {
    console.log(`  [tool] ${toolName} done (${durationMs}ms)`)
  })

  return hooks
}

// ═══ Main ═══

async function main() {
  const vitamin = createVitamin({
    port: 0,
    inspect: false,
    logger: { name: 'lead-session-example', level: 'error', destination: 'stdout' },
    model: createModel(),
    hooks: createExampleHooks(),
    workspaceDir: process.cwd(),
    maxToolTurns: 10,
    systemPrompt: [
      'You are a coding agent inside the vitamin workspace.',
      'Always inspect files before answering. Use ls/read tools.',
      'When the task is complex, produce a plan first, then delegate subtasks.',
      'Start your final answer with exactly: done',
    ].join(' '),
  })

  try {
    await ensureCopilotCredential(vitamin)
    await vitamin.start()

    console.log('--- lead session run ---')

    const result = await vitamin.lead(
      [
        '请分析当前 coding 包的项目结构。',
        '1. 先用 ls 查看 src/ 目录',
        '2. 再用 read 读取 package.json 的 scripts 部分',
        '3. 总结这个包提供了哪些主要功能和入口',
        '4. 最终回复第一行必须是 done',
      ].join('\n'),
      {
        onTaskCreated: (task) => {
          console.log(`  [task.created] ${task.id} — ${task.input.prompt.slice(0, 60)}...`)
        },
        onTaskCompleted: (task, _result, subagentResult) => {
          console.log(`  [task.completed] ${task.id} — status: ${subagentResult?.status ?? 'unknown'}`)
        },
        onTaskFailed: (task, error) => {
          console.log(`  [task.failed] ${task.id} — ${error.message}`)
        },
      },
    )

    console.log('--- result ---')
    console.log('status:', result.status)
    console.log('sessionId:', result.sessionId)
    console.log('delegated tasks:', result.tasks.length)

    if (result.concerns) {
      console.log('concerns:', result.concerns)
    }
    if (result.missingContext) {
      console.log('missing context:', result.missingContext)
    }
    if (result.blockReason) {
      console.log('block reason:', result.blockReason)
    }

    console.log('output:')
    console.log(result.output)
  } finally {
    await vitamin.stop()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
