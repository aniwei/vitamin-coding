// 路径规范化和项目根目录检测
import { dirname, normalize, resolve, sep } from 'node:path'
import { exists } from './fs'

// 规范化路径：解析 .. 和 .，统一使用正斜杠
export function normalizePath(path: string): string {
  return normalize(path).replaceAll(sep === '\\' ? '\\' : sep, '/')
}

// 从多个路径片段解析出绝对路径
export function resolvePath(...segments: string[]): string {
  return resolve(...segments)
}

// 标识项目根目录的标记文件
const PROJECT_ROOT_MARKER = '.vitamin'

// 从 startDir 开始向上遍历，查找包含根标记的目录
// 如果到达文件系统根仍未找到则返回 undefined
export async function findProjectRoot(startDir: string): Promise<string | undefined> {
  let current = resolve(startDir)
  let searching = true

  while (searching) {
    if (await exists(resolve(current, PROJECT_ROOT_MARKER))) {
      return current
    }

    const parent = dirname(current)
    
    if (parent === current) {
      searching = false
    }
    current = parent
  }
  return undefined
}
