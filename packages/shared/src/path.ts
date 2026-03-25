import { VITAMIN_PROJECT_ROOT, VITAMIN_HOME  } from '@vitamin/env'
import { normalize, resolve, join, sep } from 'node:path'
import { tmpdir } from 'node:os'
import { v5 } from 'uuid'

// 规范化路径：解析 .. 和 .，统一使用正斜杠
export function normalizePath(path: string): string {
  return normalize(path).replaceAll(sep === '\\' ? '\\' : sep, '/')
}


export function getVitaminProjectRootPath(): string {
  return VITAMIN_PROJECT_ROOT
}

export function getVitaminHomePath(): string {
  return VITAMIN_HOME
}

export function getThirdPartyToolPath(): string {
  return resolve(getVitaminHomePath(), 'tools')
}

export function getThirdPartyToolBinaryPath(toolName: string, version: string = ''): string {
  return resolve(getThirdPartyToolPath(), ...(version ? [toolName, version] : [toolName]))
}

export function createTempLoggerPath(): string {
  const id = v5(Date.now().toString(), v5.URL);
  return join(tmpdir(), `vitamin-coding-${id}.log`);
}

