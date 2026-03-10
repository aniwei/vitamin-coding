// 标签截断 Hook — 截断过长的工具调用标签
import type { HookRegistration, ToolExecuteBeforeInput, ToolExecuteBeforeOutput } from '../../types'

const MAX_LABEL_LENGTH = 200

export function createLabelTruncatorHook(): HookRegistration<'tool.execute.before'> {
  return {
    name: 'label-truncator',
    timing: 'tool.execute.before',
    priority: 20,
    enabled: true,
    handler(_input: ToolExecuteBeforeInput, output: ToolExecuteBeforeOutput): void {
      // 截断参数中可能过长的描述性字段
      for (const key of ['label', 'description', 'title']) {
        const value = output.args[key]
        if (typeof value === 'string' && value.length > MAX_LABEL_LENGTH) {
          output.args[key] = `${value.slice(0, MAX_LABEL_LENGTH)}...`
        }
      }
    },
  }
}
