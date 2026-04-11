import type { PermissionPolicy, PermissionMode } from './types'

export interface PermissionToolDescriptor {
  name: string
  readonly?: boolean
  metadata?: {
    category?: string
  }
}

export interface PermissionToolSets {
  readonlyTools: Set<string>
  writeTools: Set<string>
  fileWriteTools: Set<string>
}

export interface PermissionToolSetsInput {
  readonlyTools?: Iterable<string>
  writeTools?: Iterable<string>
  fileWriteTools?: Iterable<string>
}

function resolvePermissionToolSets(toolSets?: PermissionToolSetsInput): PermissionToolSets {
  return {
    readonlyTools: new Set(toolSets?.readonlyTools ?? []),
    writeTools: new Set(toolSets?.writeTools ?? []),
    fileWriteTools: new Set(toolSets?.fileWriteTools ?? []),
  }
}

export function createPermissionToolSetsFromRegistry(
  tools: Iterable<PermissionToolDescriptor>,
): PermissionToolSets {
  const readonlyTools = new Set<string>()
  const writeTools = new Set<string>()
  const fileWriteTools = new Set<string>()

  for (const tool of tools) {
    if (!tool.name) continue

    if (tool.readonly === true) {
      readonlyTools.add(tool.name)
      continue
    }

    if (tool.name === 'bash') {
      writeTools.add(tool.name)
      continue
    }

    if (tool.metadata?.category === 'fs') {
      writeTools.add(tool.name)
      fileWriteTools.add(tool.name)
    }
  }

  return {
    readonlyTools,
    writeTools,
    fileWriteTools,
  }
}

const PROTECTED_PATH_PATTERNS = [
  /^\/etc\//,
  /^\/usr\//,
  /^\/sys\//,
  /^\/proc\//,
  /node_modules\//,
  /\.git\//,
  /\.env$/,
  /\.env\.local$/,
]

export const FILE_GUARD_POLICY: PermissionPolicy = {
  ...createFileGuardPolicy(),
}

export function createFileGuardPolicy(toolSets?: PermissionToolSetsInput): PermissionPolicy {
  const { fileWriteTools } = resolvePermissionToolSets(toolSets)

  return {
    name: 'builtin::file-guard',
    priority: 10,
    enabled: true,
    scope: { agents: ['*'] },
    rules: [
      {
        name: 'protect-system-paths',
        effect: 'deny',
        match: {
          // 仅对能直接传递路径参数的写入工具做 paths 匹配
          // bash 不在此列，bash 的破坏性命令由 DESTRUCTIVE_COMMAND_POLICY 拦截
          tools: [...fileWriteTools],
          paths: PROTECTED_PATH_PATTERNS,
        },
        denyReason: 'Write to protected system path is not allowed',
      },
    ],
  }
}

const DESTRUCTIVE_PATTERN =
  /\b(rm\s+-rf|drop\s+table|git\s+push\s+--force|git\s+reset\s+--hard|truncate\s+table|git\s+clean\s+-fd)\b/i

export const DESTRUCTIVE_COMMAND_POLICY: PermissionPolicy = {
  name: 'builtin::destructive-guard',
  priority: 15,
  enabled: true,
  scope: { agents: ['*'] },
  rules: [
    {
      name: 'ask-destructive-bash',
      effect: 'ask',
      match: {
        tools: ['bash'],
        condition: (ctx) => {
          const command = String(ctx.args.command ?? '')
          return DESTRUCTIVE_PATTERN.test(command)
        },
      },
      askPrompt: 'This command may be destructive. Continue?',
    },
  ],
}

export function createDirectoryFreezePolicy(
  allowedDir: string,
  toolSets?: PermissionToolSetsInput,
): PermissionPolicy {
  const { fileWriteTools } = resolvePermissionToolSets(toolSets)

  return {
    name: 'builtin::directory-freeze',
    // priority > FILE_GUARD_POLICY(10)：先由 file-guard 拦截系统路径，
    // 再由 directory-freeze 限制写入范围，避免 allowedDir 内的 .env 等被错误放行
    priority: 20,
    enabled: true,
    scope: { agents: ['*'] },
    rules: [
      {
        name: 'allow-within-directory',
        effect: 'allow',
        match: {
          tools: [...fileWriteTools],
          condition: (ctx) => {
            const filePath = ctx.filePath ?? ''
            return filePath.startsWith(allowedDir)
          },
        },
      },
      {
        name: 'deny-outside-directory',
        effect: 'deny',
        match: { tools: [...fileWriteTools] },
        denyReason: `Edits frozen to directory: ${allowedDir}`,
      },
    ],
  }
}

export function createDisabledToolsPolicy(disabledTools: string[]): PermissionPolicy {
  return {
    name: 'setting::disabled-tools',
    priority: 2,
    enabled: true,
    scope: { agents: ['*'] },
    rules: [
      {
        name: 'deny-disabled',
        effect: 'deny',
        match: { tools: disabledTools },
        denyReason: 'Tool disabled by configuration',
      },
    ],
  }
}

export function createAgentBoundaryPolicy(
  agentName: string,
  allowedTools: string[],
): PermissionPolicy {
  return {
    name: `agent-boundary::${agentName}`,
    priority: 20,
    enabled: true,
    scope: { agents: [agentName] },
    rules: [
      {
        name: 'allow-declared-tools',
        effect: 'allow',
        match: { tools: allowedTools },
      },
      {
        name: 'deny-undeclared-tools',
        effect: 'deny',
        match: {},
        denyReason: `Agent "${agentName}" is not authorized to use this tool`,
      },
    ],
  }
}

export function createPermissionModePolicy(
  mode: PermissionMode,
  toolSets?: PermissionToolSetsInput,
): PermissionPolicy {
  const { readonlyTools, writeTools } = resolvePermissionToolSets(toolSets)

  switch (mode) {
    case 'bypass':
      return {
        name: 'mode::bypass',
        priority: 1,
        enabled: true,
        scope: { agents: ['*'] },
        rules: [{ name: 'allow-all', effect: 'allow', match: {} }],
      }

    case 'readonly':
      return {
        name: 'mode::readonly',
        priority: 1,
        enabled: true,
        scope: { agents: ['*'] },
        rules: [
          {
            name: 'allow-reads',
            effect: 'allow',
            match: { condition: (ctx) => readonlyTools.has(ctx.toolName) },
          },
          {
            name: 'deny-writes',
            effect: 'deny',
            match: {},
            denyReason: 'Read-only mode: write operations are not allowed',
          },
        ],
      }

    case 'confirm':
      return {
        name: 'mode::confirm',
        priority: 1,
        enabled: true,
        scope: { agents: ['*'] },
        rules: [
          {
            name: 'allow-reads',
            effect: 'allow',
            match: { condition: (ctx) => readonlyTools.has(ctx.toolName) },
          },
          {
            // match 限定在 writeTools，避免对 web-search / task 等非写入工具误发确认请求
            name: 'ask-writes',
            effect: 'ask',
            match: { tools: [...writeTools] },
            askPrompt: 'Confirm write operation?',
          },
        ],
      }

    case 'strict':
      return {
        name: 'mode::strict',
        priority: 9999,
        enabled: true,
        scope: { agents: ['*'] },
        rules: [
          {
            name: 'deny-unmatched',
            effect: 'deny',
            match: {},
            denyReason: 'Strict mode: no matching permission policy',
          },
        ],
      }

    case 'auto':
    default:
      return {
        name: 'mode::auto',
        priority: 1,
        enabled: true,
        scope: { agents: ['*'] },
        rules: [
          {
            name: 'allow-reads',
            effect: 'allow',
            match: { condition: (ctx) => readonlyTools.has(ctx.toolName) },
          },
          // 写操作 → 交由后续策略判定
        ],
      }
  }
}
