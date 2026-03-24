import { createBash } from './shell/bash'
import { createFind } from './search/find'
import { createGrep } from './search/grep'
import { createLs } from './search/ls'

// FS
import { createRead } from './fs/read'
import { createWrite } from './fs/write'
import { createEdit } from './fs/edit'

// Orchestration
import { 
  createTaskDelegate, 
  type TaskDispatch 
} from './orchestration/task-delegate'
import { 
  createPerformWork, 
  type PerformWork 
} from './orchestration/perform-work'



import type { ToolRegistry } from './tool-registry'

export interface RegisterBuiltinOptions {
  dispatchTask: TaskDispatch
  performWork: PerformWork
}

// 注册所有内置工具 (minimal + standard + full 预设)
export function registerBuiltinTools(
  registry: ToolRegistry,
  projectRoot: string,
  options: RegisterBuiltinOptions,
): void {
  /// minial
  // 基础文件系统
  registry.register([  
    createRead(projectRoot),
    createWrite(projectRoot),
    createEdit(projectRoot),
  ], { preset: 'minimal', category: 'fs', builtin: true })

  // 基础shell
  registry.register([
    createBash(projectRoot)
  ], { preset: 'minimal', category: 'shell', builtin: true })


  /// standard 
  // 搜索/导航工具
  registry.register([
    createFind(projectRoot),
    createLs(projectRoot),
  ], { preset: 'standard', category: 'search', builtin: true })

  // 任务调度工具
  registry.register([
    createTaskDelegate(projectRoot, options.dispatchTask)
  ], { preset: 'standard', category: 'orchestration', builtin: true })

  /// full
  // 任务执行工具
  registry.register([
    createPerformWork(projectRoot, options?.performWork)
  ], { preset: 'full', category: 'orchestration', builtin: true })
}
