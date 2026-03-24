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
import {
  createAgentCall,
  type CallAgent,
} from './orchestration/agent-call'


// LSP
// import { createLspDefinition } from './lsp/definition'
// import { createLspReferences } from './lsp/references'
// import { createLspSymbols } from './lsp/symbols'
// import { createLspDiagnostics } from './lsp/diagnostics'
// import { createLspPrepareRename, createLspRename } from './lsp/rename'

import type { ToolRegistry } from './tool-registry'

export interface RegisterBuiltinOptions {
  dispatchTask: TaskDispatch
  performWork: PerformWork
  callAgent: CallAgent
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
    createLs(projectRoot),
    createFind(projectRoot),
    createGrep(projectRoot, {
      binaryToolExecutorRegistry: registry.getBinaryToolExecutors()
    }),
  ], { preset: 'standard', category: 'search', builtin: true })

  // 任务调度工具
  registry.register([
    createTaskDelegate(projectRoot, options.dispatchTask),
  ], { preset: 'standard', category: 'orchestration', builtin: true })

  // LSP 工具
  // registry.register([
  //   createLspDefinition(projectRoot),
  //   createLspReferences(projectRoot),
  //   createLspSymbols(projectRoot),
  //   createLspDiagnostics(projectRoot),
  //   createLspPrepareRename(projectRoot),
  //   createLspRename(projectRoot),
  // ], { preset: 'standard', category: 'lsp', builtin: true })

  /// full
  // 任务执行工具
  registry.register([
    createAgentCall(projectRoot, options.callAgent),
    createPerformWork(projectRoot, options?.performWork),
  ], { preset: 'full', category: 'orchestration', builtin: true })
}
