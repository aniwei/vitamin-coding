import { VITAMIN_PROJECT_DIR, VITAMIN_HOME } from '@vitamin/env'
import { normalize, resolve, join, sep } from 'node:path'
import { tmpdir } from 'node:os'
import { v5 } from 'uuid'

// 规范化路径：解析 .. 和 .，统一使用正斜杠
export function normalizePath(path: string): string {
  return normalize(path).replaceAll(sep === '\\' ? '\\' : sep, '/')
}

export function getVitaminProjectDir(): string {
  return VITAMIN_PROJECT_DIR
}

export function getVitaminPromptsDir(): string {
  return resolve(getVitaminHomeDir(), 'prompts')
}

export function getVitaminSettingsPaths(): string[] {
  return [
    resolve(getVitaminProjectDir(), 'config.json'),
    resolve(getVitaminHomeDir(), 'config.json'),
  ]
}

export function getVitaminHomeDir(): string {
  return VITAMIN_HOME
}

export function getVitaminSessionDir(): string {
  return resolve(getVitaminHomeDir(), 'sessions')
}

export function getThirdPartyToolDir(): string {
  return resolve(getVitaminHomeDir(), 'tools')
}

export function getThirdPartyToolBinaryDir(toolName: string, version: string = ''): string {
  return resolve(getThirdPartyToolDir(), ...(version ? [toolName, version] : [toolName]))
}

export function createTempLoggerDir(): string {
  const id = v5(Date.now().toString(), v5.URL)
  return join(tmpdir(), `vitamin-coding-${id}.log`)
}

// Backward compatibility: historical name used by tools/tests.
export function createTempLoggerPath(): string {
  return createTempLoggerDir()
}
