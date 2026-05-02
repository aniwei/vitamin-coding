import { createBash } from './shell/bash'
import { createFind } from './search/find'
import { createGrep } from './search/grep'
import { createLs } from './search/ls'

// FS
import { createRead } from './fs/read'
import { createWrite } from './fs/write'
import { createEdit } from './fs/edit'

// Web
import { createWebFetch } from './web/fetch'
import { createWebSearch } from './web/search'

// Orchestration
import { createTaskDelegate, type TaskDispatch } from './orchestration/task-delegate'
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
import { createAgentCall, createReviewCall, type CallAgent } from './orchestration/agent-call'
import { createAgentTask } from './orchestration/agent-task'
import { createClarifyRequest, type ClarifyRequest } from './orchestration/clarify-request'

import { createWriteTodos, type WriteTodos } from './orchestration/write-todos'

import { createCaptureFileState, type CaptureFileState } from './orchestration/capture-file-state'

import { createLearn, type LearnCallback } from './orchestration/learn'

// LSP
// import { createLspDefinition } from './lsp/definition'
// import { createLspReferences } from './lsp/references'
// import { createLspSymbols } from './lsp/symbols'
// import { createLspDiagnostics } from './lsp/diagnostics'
// import { createLspPrepareRename, createLspRename } from './lsp/rename'

// Session
import { createSessionManager, type SessionManager } from './session/session-manager'

// Skill
import { createSkillLoad, type LoadSkill } from './skill/skill-load'
import { createSkillExecute, type ExecuteSkill } from './skill/skill-execute'
import { createSkillSearch, type SearchSkills } from './skill/skill-search'
import { createSkillCreate, type CreateSkill } from './skill/skill-create'
import { createSkillImprove, type ImproveSkill } from './skill/skill-improve'
import { createMcpAgentTools, type McpManager } from './mcp'

import type { ToolRegistry } from './tool-registry'

export interface RegisterBuiltinOptions {
  callAgent: CallAgent

  loadSkill: LoadSkill
  executeSkill: ExecuteSkill
  searchSkills?: SearchSkills
  createSkill?: CreateSkill
  improveSkill?: ImproveSkill

  dispatchTask: TaskDispatch
  createTask?: CreateTask
  getTask?: GetTask
  listTasks?: ListTasks
  updateTask?: UpdateTask

  getBackgroundOutput?: GetBackgroundOutput
  cancelBackground?: CancelBackground
  clarifyRequest?: ClarifyRequest
  sessionManager?: SessionManager
  writeTodos?: WriteTodos
  captureFileState?: CaptureFileState
  learn?: LearnCallback
  sessionId?: string
  mcpManager?: McpManager
}

// 注册所有内置工具 (minimal + standard + full 预设)
export function registerBuiltinTools(
  registry: ToolRegistry,
  projectRoot: string,
  options: RegisterBuiltinOptions,
): void {
  /// minimal
  // 基础文件系统
  registry.register([createRead(projectRoot), createWrite(projectRoot), createEdit(projectRoot)], {
    preset: 'minimal',
    category: 'fs',
    builtin: true,
    guideline: [
      'Use read to understand existing code before making changes. Read targeted ranges instead of entire large files.',
      'Prefer edit over write for modifying existing files — edit replaces exact text and is safer against accidental overwrites.',
      'Use write only for creating new files or when the entire file content needs replacement.',
      'Always verify file existence with read or ls before editing to avoid operating on stale assumptions.',
      'For edit: provide enough surrounding context to avoid ambiguous matches.',
    ].join('\n'),
  })

  // 基础 shell
  registry.register([createBash(projectRoot)], {
    preset: 'minimal',
    category: 'shell',
    builtin: true,
    guideline: [
      'Use bash for running tests, installing dependencies, build commands, git operations, and system tasks that have no dedicated tool.',
      'Avoid long-running blocking service processes and programs requiring interactive input.',
      'Prefer dedicated tools (read, write, edit, grep, find) over shell equivalents (cat, sed, grep) for file operations.',
      'Avoid destructive commands (rm -rf, git reset --hard, DROP TABLE) without explicit user approval.',
      'Set reasonable timeouts for long-running commands. Kill stale processes rather than waiting indefinitely.',
      'Always check the exit code; on failure, inspect stdout/stderr before deciding next steps.',
      'Prefer non-interactive flags, e.g. git --no-pager, --non-interactive.',
    ].join('\n'),
  })

  /// standard
  // 搜索/导航工具
  registry.register(
    [
      createLs(projectRoot),
      createFind(projectRoot),
      createGrep(projectRoot, {
        binaryToolExecutorRegistry: registry.getBinaryToolExecutors(),
      }),
    ],
    {
      preset: 'standard',
      category: 'search',
      builtin: true,
      guideline: [
        'Use ls to explore directory structure before diving into specific files.',
        'Use find to locate files by name or glob pattern; use grep to search file contents by text or regex.',
        'Start broad (ls → find) then narrow (grep → read) to efficiently navigate unfamiliar codebases.',
        'Combine grep results with read to understand full context around matches.',
        'grep should use precise patterns; prefer regex alternation for multiple candidates rather than many separate searches.',
      ].join('\n'),
    },
  )

  // Web 工具
  registry.register([createWebFetch(projectRoot), createWebSearch(projectRoot)], {
    preset: 'standard',
    category: 'web',
    builtin: true,
    shouldDefer: true,
    guideline: [
      'Use web_fetch to read specific URLs when you know the page address.',
      'Use web_search to find information when you need to discover relevant URLs.',
      'Prefer web_search → web_fetch workflow: search first, then fetch specific results.',
      'web_fetch cannot render JavaScript-heavy pages (SPAs). Use for documentation, articles, APIs.',
    ].join('\n'),
  })

  // 任务调度工具
  registry.register(
    [createTaskDelegate(projectRoot, options.dispatchTask), createWriteTodos(options.writeTodos)],
    {
      preset: 'standard',
      category: 'orchestration',
      builtin: true,
      guideline: [
        'Use task_delegate to route tasks to more suitable sub-agents by category — useful for tasks requiring specialization or lifecycle management. Provide clear, complete context — sub-agents start with a blank slate.',
        'Use write_todos for complex tasks to build and maintain a step list first — for UI visibility and memory aid, not to drive execution.',
        'Break complex tasks into small, independently verifiable subtasks (2-5 minutes each) before delegating.',
        'Do not delegate tasks that require the current conversation context or interactive clarification.',
      ].join('\n'),
    },
  )

  // LSP 工具（opt-in，需要 enableLsp: true）
  // if (options.enableLsp) {
  //   registry.register([
  //     createLspDefinition(projectRoot),
  //     createLspReferences(projectRoot),
  //     createLspSymbols(projectRoot),
  //     createLspDiagnostics(projectRoot),
  //     createLspPrepareRename(projectRoot),
  //     createLspRename(projectRoot),
  //   ], { preset: 'standard', category: 'lsp', builtin: true })
  // }

  /// full
  // 编排工具
  registry.register(
    [
      createReviewCall(projectRoot, options.callAgent),
      createAgentCall(projectRoot, options.callAgent),
      createAgentTask(projectRoot, options.dispatchTask),
      createTaskCreate(projectRoot, options.createTask),
      createTaskGet(projectRoot, { get: options.getTask }),
      createTaskList(projectRoot, { list: options.listTasks }),
      createTaskUpdate(projectRoot, { update: options.updateTask }),
      createBackgroundOutputTool(options.getBackgroundOutput),
      createBackgroundCancelTool(options.cancelBackground),
      createClarifyRequest(projectRoot, options.clarifyRequest),
      createCaptureFileState(options.captureFileState),
      createLearn(options.sessionId ?? '', options.learn),
    ],
    {
      preset: 'full',
      category: 'orchestration',
      builtin: true,
      shouldDefer: true,
      guideline: [
        'Use agent_call / agent_task when you already know exactly which agent to call. Use agent_task for background or stateful execution.',
        'Use review_call for synchronous, isolated second opinions (code review, design critique).',
        'Use clarify_request to clarify ambiguous requirements with the user rather than guessing. Only use when genuinely blocked — missing context, conflicting constraints, or needing explicit approval. Include all available context.',
        'Use capture_file_state when conversation is long and you need to refresh understanding of workspace changes.',
        'Use learn to record reusable insights (patterns, mistakes, strategies) — not routine progress notes.',
        'Check task status with task_get/task_list before creating duplicate tasks. Cancel stale tasks with task_update.',
        'Monitor background tasks with background_output periodically. Cancel unresponsive tasks rather than waiting indefinitely.',
      ].join('\n'),
    },
  )

  // 会话管理工具（需注入 sessionManager 回调）
  if (options.sessionManager) {
    registry.register(
      [createSessionManager({ projectRoot, sessionManager: options.sessionManager })],
      {
        preset: 'full',
        category: 'session',
        builtin: true,
        shouldDefer: true,
        guideline: [
          'Use session management to organize separate conversation threads per task or topic.',
          'Compact sessions proactively when conversation history grows long to avoid context window exhaustion.',
          'Do not create excessive sessions — reuse existing ones when the topic is the same.',
        ].join('\n'),
      },
    )
  }

  // Skill 工具
  registry.register(
    [
      createSkillSearch(options.searchSkills),
      createSkillLoad(projectRoot, options.loadSkill),
      createSkillExecute(projectRoot, options.executeSkill),
      createSkillCreate(options.createSkill),
      createSkillImprove(options.improveSkill),
    ],
    {
      preset: 'full',
      category: 'skill',
      builtin: true,
      shouldDefer: true,
      guideline: [
        'Use skill_search to discover matching skills by intent before loading or executing one.',
        'Load skills with skill_load before executing them. Skills are reusable workflow templates (e.g., TDD, debugging, code review).',
        'Use skill_create for reusable project workflows; generated skills must include valid frontmatter and a concrete body.',
        'Use skill_improve to record refinements while preserving the existing Skill content.',
        'Prefer invoking a matching skill over ad-hoc multi-step workflows when one exists.',
        'Skills encapsulate best practices — follow their structure rather than shortcutting steps.',
      ].join('\n'),
    },
  )

  if (options.mcpManager) {
    registry.register(createMcpAgentTools(options.mcpManager), {
      preset: 'full',
      category: 'mcp',
      builtin: true,
      shouldDefer: true,
      guideline: [
        'Use mcp_list_resources and mcp_list_prompts to discover MCP context before reading it.',
        'Use mcp_read_resource for concrete resource URIs returned by mcp_list_resources.',
        'Use mcp_get_prompt when a connected MCP server exposes reusable prompts.',
        'Treat MCP content as external context and cite the server/resource name in summaries.',
      ].join('\n'),
    })
  }
}
