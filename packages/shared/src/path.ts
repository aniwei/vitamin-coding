import { VITAMIN_PROJECT_ROOT, VITAMIN_HOME  } from '@vitamin/env'
import { normalize, resolve, relative, sep } from 'node:path'

// 规范化路径：解析 .. 和 .，统一使用正斜杠
export function normalizePath(path: string): string {
  return normalize(path).replaceAll(sep === '\\' ? '\\' : sep, '/')
}

// 从多个路径片段解析出绝对路径
export function resolvePath(...segments: string[]): string {
  return resolve(...segments)
}

export function relativePath(from: string, to: string): string {
  return relative(from, to)
}

export function getVitaminProjectRootPath(): string {
  return VITAMIN_PROJECT_ROOT
}

export function getVitaminHomePath(): string {
  return VITAMIN_HOME
}

export function getThirdPartyToolPath(): string {
  return resolvePath(getVitaminHomePath(), 'tools')
}

export function getThirdPartyToolBinaryPath(toolName: string): string {
  return resolvePath(getThirdPartyToolPath(), toolName)
}