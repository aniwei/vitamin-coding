/**
 * 批量比较不同模型在复杂任务示例中的行为差异。
 *
 * 默认会测试：
 * - github-copilot/gpt-4o
 * - github-copilot/gpt-4.1
 * - github-copilot/o4-mini
 * - github-copilot/gemini-2.5-pro
 *
 * 可通过环境变量覆盖：
 * - CODING_EXAMPLE_MODELS=github-copilot/gpt-4o,github-copilot/gemini-2.5-pro
 * - CODING_EXAMPLE_PROMPT=...
 * - CODING_EXAMPLE_MAX_TOOL_TURNS=20
 *
 * 该脚本通过子进程逐个运行 complex-task 示例，
 * 从而复用相同的 prompt、沙箱策略和日志格式。
 */

import { spawn } from 'node:child_process'

const DEFAULT_MODELS = [
  'github-copilot/gpt-4o',
  'github-copilot/gpt-4.1',
  'github-copilot/o4-mini',
  'github-copilot/gemini-2.5-pro',
]

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback

  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function getModels(): string[] {
  const raw = process.env.CODING_EXAMPLE_MODELS
  if (!raw) return DEFAULT_MODELS

  return raw
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
}

type CompareResult = {
  modelId: string
  ok: boolean
  durationMs: number
  totalMessages: number
  totalToolCalls: number
  toolNames: string[]
  workspaceSource?: string
  responsePreview: string
  error?: string
}

function parseOutput(modelId: string, output: string, durationMs: number, exitCode: number | null): CompareResult {
  const responseMatch = output.match(/^\[complex-task\] final response: (.*)$/m)
  const totalMessagesMatch = output.match(/^\[complex-task\] total messages: (\d+)$/m)
  const totalToolCallsMatch = output.match(/^\[complex-task\] total tool calls: (\d+)$/m)
  const workspaceSourceMatch = output.match(/^\[complex-task\] workspaceSource: (.*)$/m)
  const errorMatch = output.match(/^\[complex-task\] error: (.*)$/m)
  const toolNames = [...output.matchAll(/Executing tool ([a-zA-Z0-9_-]+)/g)].map((match) => match[1] ?? '')

  return {
    modelId,
    ok: exitCode === 0 && !errorMatch,
    durationMs,
    totalMessages: totalMessagesMatch ? Number.parseInt(totalMessagesMatch[1] ?? '0', 10) : 0,
    totalToolCalls: totalToolCallsMatch ? Number.parseInt(totalToolCallsMatch[1] ?? '0', 10) : 0,
    toolNames: [...new Set(toolNames.filter((name) => name.length > 0))],
    workspaceSource: workspaceSourceMatch?.[1]?.trim(),
    responsePreview: responseMatch?.[1]?.trim() ?? '',
    error: errorMatch?.[1]?.trim() ?? (exitCode === 0 ? undefined : `process exited with code ${exitCode ?? -1}`),
  }
}

async function runModel(modelId: string, maxToolTurns: number): Promise<CompareResult> {
  const startTime = Date.now()
  const command = process.platform === 'win32' ? 'npx.cmd' : 'npx'

  return new Promise<CompareResult>((resolve) => {
    const child = spawn(command, ['tsx', 'example/complex-task.ts'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        CODING_EXAMPLE_MODEL_ID: modelId,
        CODING_EXAMPLE_MAX_TOOL_TURNS: String(maxToolTurns),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let output = ''

    child.stdout.on('data', (chunk) => {
      output += chunk.toString()
    })

    child.stderr.on('data', (chunk) => {
      output += chunk.toString()
    })

    child.on('error', (error) => {
      resolve({
        modelId,
        ok: false,
        durationMs: Date.now() - startTime,
        totalMessages: 0,
        totalToolCalls: 0,
        toolNames: [],
        responsePreview: '',
        error: error.message,
      })
    })

    child.on('close', (exitCode) => {
      resolve(parseOutput(modelId, output, Date.now() - startTime, exitCode))
    })
  })
}

async function main() {
  const models = getModels()
  const maxToolTurns = parsePositiveInt(process.env.CODING_EXAMPLE_MAX_TOOL_TURNS, 20)
  const prompt = process.env.CODING_EXAMPLE_PROMPT
    ?? '重构 session 模块：拆分 agent-session.ts 为独立的 prompt-handler 和 lifecycle-manager'

  console.log('[compare] prompt:', prompt)
  console.log('[compare] maxToolTurns:', maxToolTurns)
  console.log('[compare] models:', models.join(', '))

  for (const modelId of models) {
    console.log(`\n[compare] running: ${modelId}`)
    const result = await runModel(modelId, maxToolTurns)

    if (!result.ok) {
      console.log(`[compare] status: error`)
      console.log(`[compare] error: ${result.error}`)
      console.log(`[compare] durationMs: ${result.durationMs}`)
      continue
    }

    console.log('[compare] status: ok')
    console.log(`[compare] durationMs: ${result.durationMs}`)
  console.log(`[compare] workspaceSource: ${result.workspaceSource ?? '(unknown)'}`)
    console.log(`[compare] totalMessages: ${result.totalMessages}`)
    console.log(`[compare] totalToolCalls: ${result.totalToolCalls}`)
    console.log(`[compare] toolNames: ${result.toolNames.join(', ') || '(none)'}`)
    console.log(`[compare] responsePreview: ${result.responsePreview}`)
  }
}

main().catch((error) => {
  console.error('[compare] error:', error)
  process.exitCode = 1
})