// Ralph Loop 检测 Hook — 检测工具调用死循环
import { createLogger } from '@vitamin/shared'

import type { HookRegistration, ToolExecuteAfterInput, ToolExecuteAfterOutput } from '../../types'

const log = createLogger('hooks:ralph-loop')

// 跟踪每个 session 的工具调用序列指纹
const sessionSequences = new Map<string, string[]>()

// 循环检测参数
const SEQUENCE_WINDOW = 20
const MIN_PATTERN_LENGTH = 2
const MAX_PATTERN_LENGTH = 5
const REPETITION_THRESHOLD = 3

export function createRalphLoopHook(): HookRegistration<'tool.execute.after'> {
  return {
    name: 'ralph-loop',
    timing: 'tool.execute.after',
    priority: 40,
    enabled: true,
    handler(input: ToolExecuteAfterInput, output: ToolExecuteAfterOutput): void {
      const sequence = sessionSequences.get(input.sessionId) ?? []
      sequence.push(input.toolName)

      // 保持窗口大小
      while (sequence.length > SEQUENCE_WINDOW) {
        sequence.shift()
      }
      sessionSequences.set(input.sessionId, sequence)

      // 检测重复模式
      const pattern = detectLoop(sequence)
      if (pattern) {
        const warning = `Loop detected: pattern [${pattern.join(' → ')}] repeated ${REPETITION_THRESHOLD}+ times`
        log.warn(warning)
        output.metadata.loopDetected = true
        output.metadata.loopPattern = pattern

        // 在输出中追加警告
        output.result = {
          ...output.result,
          content: [
            ...output.result.content,
            { type: 'text', text: `\n\n⚠️ ${warning}. Please try a different approach.` },
          ],
        }
      }
    },
  }
}

// 检测工具调用序列中的循环模式
function detectLoop(sequence: string[]): string[] | null {
  if (sequence.length < MIN_PATTERN_LENGTH * REPETITION_THRESHOLD) return null

  for (let patternLen = MIN_PATTERN_LENGTH; patternLen <= MAX_PATTERN_LENGTH; patternLen++) {
    if (sequence.length < patternLen * REPETITION_THRESHOLD) continue

    // 取最近的 patternLen 个调用作为候选模式
    const candidatePattern = sequence.slice(-patternLen)
    let matches = 0

    // 向前检查是否重复
    for (let offset = patternLen; offset <= sequence.length - patternLen; offset += patternLen) {
      const segment = sequence.slice(-(offset + patternLen), -offset)
      if (segment.length === patternLen && segment.every((tool, i) => tool === candidatePattern[i])) {
        matches++
      } else {
        break
      }
    }

    if (matches + 1 >= REPETITION_THRESHOLD) {
      return candidatePattern
    }
  }

  return null
}
