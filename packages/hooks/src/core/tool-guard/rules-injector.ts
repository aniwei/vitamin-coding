// Rules 注入 Hook — 注入 .rules/*.md 内容到工具参数
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { exists } from '@vitamin/shared'

import type { HookRegistration, ToolExecuteBeforeInput, ToolExecuteBeforeOutput } from '../../types'

// 缓存已加载的规则内容
let cachedRules: string | null = null
let cacheProjectRoot: string | null = null

export function createRulesInjectorHook(projectRoot: string): HookRegistration<'tool.execute.before'> {
  return {
    name: 'rules-injector',
    timing: 'tool.execute.before',
    priority: 30,
    enabled: true,
    async handler(input: ToolExecuteBeforeInput, output: ToolExecuteBeforeOutput): Promise<void> {
      // 仅对写入类工具注入规则
      if (!INJECTION_TOOLS.has(input.toolName)) return

      const rules = await loadRules(projectRoot)
      if (rules) {
        output.args._injectedRules = rules
      }
    },
  }
}

const INJECTION_TOOLS = new Set(['write', 'edit', 'edit-diff'])

// 加载 .rules 目录下所有 md 文件
async function loadRules(projectRoot: string): Promise<string | null> {
  if (cacheProjectRoot === projectRoot && cachedRules !== null) {
    return cachedRules
  }

  const rulesDir = join(projectRoot, '.rules')
  if (!(await exists(rulesDir))) {
    cachedRules = null
    cacheProjectRoot = projectRoot
    return null
  }

  try {
    const files = await readdir(rulesDir)
    const mdFiles = files.filter((f) => f.endsWith('.md')).sort()
    if (mdFiles.length === 0) {
      cachedRules = null
      cacheProjectRoot = projectRoot
      return null
    }

    const contents = await Promise.all(
      mdFiles.map(async (f) => {
        const content = await readFile(join(rulesDir, f), 'utf-8')
        return `# ${f}\n${content}`
      }),
    )

    cachedRules = contents.join('\n\n---\n\n')
    cacheProjectRoot = projectRoot
    return cachedRules
  } catch {
    cachedRules = null
    cacheProjectRoot = projectRoot
    return null
  }
}
