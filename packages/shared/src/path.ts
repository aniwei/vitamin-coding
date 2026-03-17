// 路径规范化和项目根目录检测
import { dirname, normalize, resolve, sep } from 'node:path'
import { exists } from './fs'

// 标识项目根目录的标记文件
const PROJECT_ROOT_MARKER = '.vitamin'

// 规范化路径：解析 .. 和 .，统一使用正斜杠
export function normalizePath(path: string): string {
  return normalize(path).replaceAll(sep === '\\' ? '\\' : sep, '/')
}

// 从多个路径片段解析出绝对路径
export function resolvePath(...segments: string[]): string {
  return resolve(...segments)
}
