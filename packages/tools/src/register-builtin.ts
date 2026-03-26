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
import { createTaskCreate, type CreateTask } from './orchestration/task-create'
import { createTaskGet, type GetTask } from './orchestration/task-get'
import { createTaskList, type ListTasks } from './orchestration/task-list'
import { createTaskUpdate, type UpdateTask } from './orchestration/task-update'
import {
  createBackgroundOutputTool,
  type GetBackgroundOutput,
} from './orchestration/background-task-output'
import {
  createBackgroundCancelTool,
  type CancelBackground,
} from './orchestration/background-task-cancel'
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

import { createSkillLoad, type LoadSkill  } from './skill/skill-load'
import { createSkillExecute, type ExecuteSkill } from './skill/skill-execute'

import type { ToolRegistry } from './tool-registry'

export interface RegisterBuiltinOptions {
  dispatchTask: TaskDispatch
  performWork: PerformWork
  callAgent: CallAgent
  loadSkill: LoadSkill,
  executeSkill: ExecuteSkill,
  createTask?: CreateTask
  getTask?: GetTask
  listTasks?: ListTasks
  updateTask?: UpdateTask
  getBackgroundOutput?: GetBackgroundOutput
  cancelBackground?: CancelBackground
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
    createTaskCreate(projectRoot, options.createTask),
    createTaskGet(projectRoot, { get: options.getTask }),
    createTaskList(projectRoot, { list: options.listTasks }),
    createTaskUpdate(projectRoot, { update: options.updateTask }),
    createBackgroundOutputTool(options.getBackgroundOutput),
    createBackgroundCancelTool(options.cancelBackground),
  ], { preset: 'full', category: 'orchestration', builtin: true })

  // Skill 工具
  registry.register([
    createSkillLoad(projectRoot, options.loadSkill),
    createSkillExecute(projectRoot, options.executeSkill),
  ], { preset: 'full', category: 'skill', builtin: true })
}
