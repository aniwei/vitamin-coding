import { X_MARS_PROJECT_DIR, X_MARS_HOME } from '@x-mars/env'
import { normalize, resolve, join, sep } from 'node:path'
import { tmpdir } from 'node:os'
import { v5 } from 'uuid'

// 规范化路径：解析 .. 和 .，统一使用正斜杠
export function normalizePath(path: string): string {
  return normalize(path).replaceAll(sep === '\\' ? '\\' : sep, '/')
}

export function getXMarsProjectDir(): string {
  return X_MARS_PROJECT_DIR
}

export function getXMarsPromptsDir(): string {
  return resolve(getXMarsHomeDir(), 'prompts')
}

export function getXMarsSettingsPaths(): string[] {
  return [resolve(getXMarsProjectDir(), 'config.json'), resolve(getXMarsHomeDir(), 'config.json')]
}

export function getXMarsHomeDir(): string {
  return X_MARS_HOME
}

export function getXMarsSessionDir(): string {
  return resolve(getXMarsHomeDir(), 'sessions')
}

export function getThirdPartyToolDir(): string {
  return resolve(getXMarsHomeDir(), 'tools')
}

export function getThirdPartyToolBinaryDir(toolName: string, version: string = ''): string {
  return resolve(getThirdPartyToolDir(), ...(version ? [toolName, version] : [toolName]))
}

export function createTempLoggerDir(): string {
  const id = v5(Date.now().toString(), v5.URL)
  return join(tmpdir(), `x-mars-coding-${id}.log`)
}

// 向后兼容别名，保留历史命名与工具/测试兼容
export function createTempLoggerPath(): string {
  return createTempLoggerDir()
}
