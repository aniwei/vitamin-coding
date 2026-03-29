import { createHookRegistry } from '@vitamin/hooks'
import { createInterface } from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import { createVitamin } from '../src'

import type { Model, OAuthInfo, OAuthPrompt } from '../../ai/src'
import type { ToolResult } from '@vitamin/agent'

function createModel(): Model {
  return {
    id: 'github-copilot/gpt-4.1',
    name: 'gpt-4.1',
    api: 'github-copilot',
    provider: 'github-copilot',
    baseUrl: 'https://api.githubcopilot.com',
    reasoning: false,
    input: ['text', 'image'],
    cost: {
      input: 3,
      output: 12,
      cacheRead: 1.5,
      cacheWrite: 3,
    },
    contextWindow: 1_048_576,
    maxOutputTokens: 32_768,
  }
}

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

function summarizeToolResult(result: ToolResult): string {
  const text = result.content
    .filter((part) => part.type === 'text')
    .map((part) => part.text)
    .join('\n')
    .trim()

  if (!text) {
    return 'no text output'
  }

  return text.length > 180 ? `${text.slice(0, 180)}...` : text
}

function createExampleHooks() {
  const hooks = createHookRegistry({ preset: 'none' })

  hooks.on('tool.execute.before', 'example-tool-before-log', ({ toolName, args }) => {
    console.log(`[tool.before] ${toolName} ${JSON.stringify(args)}`)
  })

  hooks.on('tool.execute.after', 'example-tool-after-log', ({ toolName, durationMs, result }) => {
    console.log(`[tool.after] ${toolName} ${durationMs}ms ${summarizeToolResult(result)}`)
  })

  return hooks
}

function createDemoApp(inspect: boolean) {
  return createVitamin({
    port: 0,
    inspect,
    logger: {
      name: 'vitamin-agent-flow-example',
      level: 'error',
      destination: 'stdout',
    },
    model: createModel(),
    hooks: createExampleHooks(),
    workspaceDir: process.cwd(),
    maxToolTurns: 6,
    systemPrompt: [
      'You are a coding agent running inside the vitamin workspace.',
      'You must use workspace tools before answering.',
      'Always inspect the relevant files with ls/read before giving your final summary.',
      'The final answer must start with a line that is exactly: done',
    ].join(' '),
  })
}

async function ensureCopilotCredential(vitamin: ReturnType<typeof createDemoApp>) {
  const hasCredential = await vitamin.auth.hasCredential('github-copilot')
  if (hasCredential) {
    console.log('github-copilot credential: ready')
    return
  }

  if (!isInteractiveLoginAllowed()) {
    throw new Error([
      'Missing GitHub Copilot credential.',
      'Set COPILOT_GITHUB_TOKEN/GH_TOKEN/GITHUB_TOKEN, or rerun in an interactive terminal to complete device login.',
      'For CI-style validation you can keep VITAMIN_NONINTERACTIVE=1 to skip login prompts.',
    ].join(' '))
  }

  console.log('github-copilot credential: missing, starting device login...')
  await vitamin.auth.login('github-copilot', {
    onPrompt: (prompt: OAuthPrompt) => promptUser(prompt),
    onAuth: ({ url, code, instructions }: OAuthInfo) => {
      console.log('Open this URL in your browser:')
      console.log(url)
      console.log(`Device code: ${code}`)
      if (instructions) {
        console.log(instructions)
      }
      console.log('Waiting for GitHub Copilot authorization...')
    },
    onProgress: (message: string) => {
      if (message) {
        console.log(`[login] ${message}`)
      }
    },
  })

  console.log('github-copilot credential: login completed')
}

function buildPrompt(): string {
  return [
    '请真实跑通一遍整体 agent 流程。',
    '要求：',
    '1. 先调用 ls 查看当前目录下的 example 目录。',
    '2. 再调用 read 读取 ./package.json 和 ./README.md 的相关内容。',
    '3. 最后总结这个 coding 包有哪些 example script。',
    '4. 最终回复第一行必须是 done。',
  ].join('\n')
}

async function main() {
  const tryInspect = process.env.VITAMIN_TRY_INSPECT === '1'
  let vitamin = createDemoApp(tryInspect)

  try {
    await ensureCopilotCredential(vitamin)

    try {
      await vitamin.start()
    } catch (error) {
      if (!tryInspect) {
        throw error
      }

      console.warn('inspect startup failed, fallback to inspect=false:', error instanceof Error ? error.message : String(error))
      await vitamin.stop().catch(() => undefined)
      vitamin = createDemoApp(false)
      await vitamin.start()
    }

    const devtools = vitamin.getDevtools()
    devtools?.debugger.disableAllBreakpoints()

    const enabledCount = devtools?.debugger.listBreakpoints().filter((item) => item.enabled).length ?? 0
    console.log('inspect enabled:', Boolean(devtools))
    if (devtools) {
      console.log('enabled breakpoints after disableAllBreakpoints():', enabledCount)
    } else {
      console.log('breakpoints disabled by configuration: inspect=false')
    }

    const orchestrator = vitamin.orchestrator
    if (!orchestrator) {
      throw new Error('VitaminApp failed to initialize orchestrator')
    }

    const stopCreated = orchestrator.eventBus.on('task.created', ({ task }) => {
      console.log('[task.created]', task.id, task.input.prompt)
    })
    const stopStarted = orchestrator.eventBus.on('task.started', ({ task, agent }) => {
      console.log('[task.started]', task.id, agent)
    })
    const stopCompleted = orchestrator.eventBus.on('task.completed', ({ task, result }) => {
      console.log('[task.completed]', task.id, result.summary)
    })

    const result = await orchestrator.dispatcher.dispatch({
      prompt: buildPrompt(),
      mode: 'sync',
    })

    stopCreated()
    stopStarted()
    stopCompleted()

    if (!result.success) {
      throw new Error(result.error ?? 'Dispatcher returned an unknown failure')
    }

    console.log('dispatcher output:')
    console.log(result.output)
  } finally {
    await vitamin.stop()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})