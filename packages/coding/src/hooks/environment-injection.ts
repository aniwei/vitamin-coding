/**
 * environment-injection.ts
 *
 * 将运行时环境上下文（工作目录、git 状态、日期）注入到 system prompt。
 * priority=25（在 tool-guidance 之后，phase-injection 之前）。
 */

import { collectEnvironment, formatEnvironmentBlock } from '@vitamin/prompt'
import type { HookSpec } from '@vitamin/hooks'
import { defineHook } from '@vitamin/hooks'

export function createEnvironmentInjectionHook(workspaceDir: string): HookSpec {
  return defineHook({
    name: 'environment-injection',
    timing: 'system-prompt.transform',
    priority: 25,
    handle: async (_input, output) => {
      const exec = async (cmd: string, cwd: string) => {
        const { execSync } = await import('node:child_process')
        return execSync(cmd, { cwd, encoding: 'utf-8', timeout: 5000 })
      }
      try {
        const env = await collectEnvironment(workspaceDir, exec)
        const block = formatEnvironmentBlock(env)
        output.systemPrompt = `${output.systemPrompt}\n\n${block}`
      } catch {
        // 环境收集失败不应中断 prompt 组装
      }
    },
  })
}
