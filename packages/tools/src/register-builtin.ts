// 注册所有内置工具到 ToolRegistry
import { createAstGrep, type AstGrepOptions } from './search/ast-grep'
import { createBash } from './shell/bash'
import { createEditDiff } from './builtin/edit-diff'
import { createFind } from './search/find'
import { createGlob } from './search/glob'
import { createGrep } from './search/grep'
import { createHashlineEdit } from './builtin/hashline-edit'
import { createInteractiveBash } from './builtin/interactive-bash'
import { createLookAt } from './builtin/look-at'
import { createLs } from './search/ls'
import { createRead } from './fs/read'
import { createWrite } from './fs/write'
import { createEdit } from './fs/edit'

// 编排工具
import { createDelegateTask } from './orchestration/task-delegate'
import { createStartWork } from './orchestration/perform-work'
import { createBackgroundOutputTool } from './orchestration/background-task-output'
import { createBackgroundCancelTool } from './orchestration/background-task-cancel'
import { createCallAgent } from './orchestration/agent-call'

// Skill 工具
import { createSkillExecutor } from './skill/skill-executor'
import { createSkillMcp } from './skill/skill-mcp'
import { createSkillLoader } from './skill/skill-loader'

// 会话管理工具
import { createSessionManager } from './session/session-manager'

// 任务管理工具
import { createTaskCreate } from './orchestration/task-create'
import { createTaskGet } from './orchestration/task-get'
import { createTaskList } from './orchestration/task-list'
import { createTaskUpdate } from './orchestration/task-update'

import type { ToolRegistry } from './tool-registry'
import type { DelegateTaskOptions, TaskDispatch } from './orchestration/task-delegate'
import type { StartWork } from './orchestration/perform-work'
import type { GetBackgroundOutput } from './orchestration/background-task-output'
import type { CancelBackground } from './orchestration/background-task-cancel'
import type { CallAgent } from './orchestration/agent-call'
import type { ExecuteSkill } from './skill/skill-executor'
import type { CallSkillMcp } from './skill/skill-mcp'
import type { LoadSkill } from './skill/skill-loader'
import type { SessionManager } from './session/session-manager'
import type { CreateTask } from './orchestration/task-create'
import type { GetTask } from './orchestration/task-get'
import type { ListTasks } from './orchestration/task-list'
import type { UpdateTask } from './orchestration/task-update'
import type { RegisterSkillOptions } from './types'

export interface RegisterBuiltinOptions {
  astGrep?: AstGrepOptions
  delegateTask?: DelegateTaskOptions
  startWork?: StartWorkOptions
  getBackgroundOutput?: GetBackgroundOutput
  cancelBackground?: CancelBackground
  skill?: RegisterSkillOptions
  callAgent?: CallAgentptions
  
  sessionManager?: SessionManager
  createTask?: CreateTask
  getTask?: GetTask
  listTasks?: ListTasks
  updateTask?: UpdateTask
}

// 注册所有内置工具 (minimal + standard + full 预设)
export function registerBuiltinTools(
  registry: ToolRegistry,
  projectRoot: string,
  options?: Omit<RegisterBuiltinOptions, 'projectRoot'>,
): void {
  registry.register(createFs({
    projectRoot
  }), {
    preset: 'minimal',
    category: 'filesystem',
    builtin: true,
  })

  
  registry.register(createBash(projectRoot), {
    preset: 'minimal',
    category: 'shell',
    builtin: true,
  })

  // standard 预设 (6 个搜索/导航工具)
  registry.register(createGrep(projectRoot), {
    preset: 'standard',
    category: 'search',
    builtin: true,
  })

  registry.register(createGlob(projectRoot), {
    preset: 'standard',
    category: 'search',
    builtin: true,
  })

  registry.register(createFind(projectRoot), {
    preset: 'standard',
    category: 'search',
    builtin: true,
  })

  registry.register(createLs(projectRoot), {
    preset: 'standard',
    category: 'search',
    builtin: true,
  })

  registry.register(createAstGrep({
    projectRoot,
    maxOutputSize: options?.astGrep?.maxOutputSize
  }), {
    preset: 'standard',
    category: 'search',
    builtin: true,
  })

  // standard 预设 - 编排工具
  registry.register(createDelegateTask(options?.taskDispatch), {
    preset: 'standard',
    category: 'orchestration',
    builtin: true,
  })

  // builtin 高级编辑/查看
  registry.register(createEditDiff(projectRoot), {
    preset: 'full',
    category: 'filesystem',
    builtin: true,
  })

  registry.register(createLookAt(projectRoot), {
    preset: 'full',
    category: 'multimodal',
    builtin: true,
  })

  registry.register(createInteractiveBash(projectRoot), {
    preset: 'full',
    category: 'shell',
    builtin: true,
  })

  registry.register(createHashlineEdit(projectRoot), {
    preset: 'full',
    category: 'filesystem',
    builtin: true,
  })

  // 编排工具
  registry.register(createStartWork(options?.startWork), {
    preset: 'full',
    category: 'orchestration',
    builtin: true,
  })

  registry.register(createBackgroundOutputTool(options?.getBackgroundOutput), {
    preset: 'full',
    category: 'orchestration',
    builtin: true,
  })

  registry.register(createBackgroundCancelTool(options?.cancelBackground), {
    preset: 'full',
    category: 'orchestration',
    builtin: true,
  })

  registry.register(createCallAgent(options?.callAgent), {
    preset: 'full',
    category: 'orchestration',
    builtin: true,
  })

  // Skill 工具
  registry.register(createSkillExecutor(options.skill), {
    preset: 'full',
    category: 'skill',
    builtin: true,
  })

  registry.register(createSkillMcp(options?.skill), {
    preset: 'full',
    category: 'skill',
    builtin: true,
  })

  registry.register(createSkillLoader(options?.skill), {
    preset: 'full',
    category: 'skill',
    builtin: true,
  })

  // 会话管理
  registry.register(createSessionManager(options?.sessionManager), {
    preset: 'full',
    category: 'session',
    builtin: true,
  })

  // 任务管理
  registry.register(createTaskCreate(options?.createTask), {
    preset: 'full',
    category: 'task',
    builtin: true,
  })

  registry.register(createTaskGet(options?.getTask), {
    preset: 'full',
    category: 'task',
    builtin: true,
  })

  registry.register(createTaskList(options?.listTasks), {
    preset: 'full',
    category: 'task',
    builtin: true,
  })

  registry.register(createTaskUpdate(options?.updateTask), {
    preset: 'full',
    category: 'task',
    builtin: true,
  })
}
