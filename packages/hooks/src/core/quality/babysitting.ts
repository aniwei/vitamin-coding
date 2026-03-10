// Babysitting Hook — 检测 Agent 异常行为模式
import { createLogger } from '@vitamin/shared'

import type { HookRegistration, ToolExecuteAfterInput, ToolExecuteAfterOutput } from '../../types'

const log = createLogger('@vitamin/hooks:babysitting')

// 跟踪每个 session 最近的工具调用
const sessionToolHistory = new Map<string, RecentToolCall[]>()

interface RecentToolCall {
  toolName: string
  timestamp: number
  isError: boolean
}

// 检测阈值
const MAX_CONSECUTIVE_ERRORS = 3
const MAX_SAME_TOOL_CALLS = 5
const HISTORY_WINDOW_MS = 60_000

export function createBabysittingHook(): HookRegistration<'tool.execute.after'> {
  return {
    name: 'babysitting',
    timing: 'tool.execute.after',
    priority: 30,
    enabled: true,
    handler(input: ToolExecuteAfterInput, output: ToolExecuteAfterOutput): void {
      const history = getHistory(input.sessionId)

      // 记录本次调用
      history.push({
        toolName: input.toolName,
        timestamp: Date.now(),
        isError: input.result.isError === true,
      })

      // 清理过期记录
      pruneHistory(history)
      sessionToolHistory.set(input.sessionId, history)

      // 检查连续错误
      const recentErrors = countConsecutiveErrors(history)
      if (recentErrors >= MAX_CONSECUTIVE_ERRORS) {
        const warning = `Agent has ${recentErrors} consecutive tool errors. Consider changing approach.`
        log.warn(warning)
        output.metadata.babysittingWarning = warning
      }

      // 检查重复工具调用
      const sameToolCount = countRecentSameTool(history, input.toolName)
      if (sameToolCount >= MAX_SAME_TOOL_CALLS) {
        const warning = `Agent called "${input.toolName}" ${sameToolCount} times recently. Possible loop.`
        log.warn(warning)
        output.metadata.babysittingWarning = warning
      }
    },
  }
}

function getHistory(sessionId: string): RecentToolCall[] {
  return sessionToolHistory.get(sessionId) ?? []
}

function pruneHistory(history: RecentToolCall[]): void {
  const cutoff = Date.now() - HISTORY_WINDOW_MS
  while (history.length > 0 && (history[0]?.timestamp ?? 0) < cutoff) {
    history.shift()
  }
}

function countConsecutiveErrors(history: RecentToolCall[]): number {
  let count = 0
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i]?.isError) {
      count++
    } else {
      break
    }
  }
  return count
}

function countRecentSameTool(history: RecentToolCall[], toolName: string): number {
  return history.filter((call) => call.toolName === toolName).length
}
