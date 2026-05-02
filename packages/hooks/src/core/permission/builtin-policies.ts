import path from 'node:path'

import type { PermissionContext, PermissionPolicy, PermissionMode } from './types'

export interface PermissionToolDescriptor {
  name: string
  readonly?: boolean | ((params: unknown) => boolean)
  metadata?: {
    category?: string
  }
}

export interface PermissionToolSets {
  readonlyTools: Set<string>
  writeTools: Set<string>
  fileWriteTools: Set<string>
  networkTools: Set<string>
}

export interface PermissionToolSetsInput {
  readonlyTools?: Iterable<string>
  writeTools?: Iterable<string>
  fileWriteTools?: Iterable<string>
  networkTools?: Iterable<string>
}

function resolvePermissionToolSets(toolSets?: PermissionToolSetsInput): PermissionToolSets {
  return {
    readonlyTools: new Set(toolSets?.readonlyTools ?? []),
    writeTools: new Set(toolSets?.writeTools ?? []),
    fileWriteTools: new Set(toolSets?.fileWriteTools ?? []),
    networkTools: new Set(toolSets?.networkTools ?? []),
  }
}

export function createPermissionToolSetsFromRegistry(
  tools: Iterable<PermissionToolDescriptor>,
): PermissionToolSets {
  const readonlyTools = new Set<string>()
  const writeTools = new Set<string>()
  const fileWriteTools = new Set<string>()
  const networkTools = new Set<string>()

  for (const tool of tools) {
    if (!tool.name) {
      continue
    }

    if (
      tool.metadata?.category === 'web' ||
      tool.metadata?.category === 'network' ||
      tool.name.startsWith('web_') ||
      tool.name.startsWith('mcp__')
    ) {
      networkTools.add(tool.name)
    }

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
    networkTools,
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

const ROOT_REMOVAL_PATTERN = /\brm\s+(?:-[^\s]*r[^\s]*f|-[^\s]*f[^\s]*r)\s+(?:\/|~|\$HOME)(?:\s|$)/i

const BLOCKED_NETWORK_PROTOCOLS = new Set(['file:', 'ftp:', 'data:', 'javascript:'])
const BLOCKED_NETWORK_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  'metadata.google.internal',
  '169.254.169.254',
])

function isPrivateNetworkHost(hostname: string): boolean {
  if (hostname.startsWith('10.')) {
    return true
  }
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)) {
    return true
  }
  if (hostname.startsWith('192.168.')) {
    return true
  }
  if (hostname.startsWith('169.254.')) {
    return true
  }
  if (hostname.startsWith('127.')) {
    return true
  }
  if (hostname === '::1') {
    return true
  }
  if (/^fe80:/i.test(hostname)) {
    return true
  }
  if (/^fc00:/i.test(hostname)) {
    return true
  }
  if (/^fd[0-9a-f]{2}:/i.test(hostname)) {
    return true
  }
  return false
}

function isBlockedNetworkUrl(raw: string): boolean {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return false
  }

  if (BLOCKED_NETWORK_PROTOCOLS.has(url.protocol)) {
    return true
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return true
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, '')
  return BLOCKED_NETWORK_HOSTS.has(hostname) || isPrivateNetworkHost(hostname)
}

export function createNonBypassableSafetyPolicy(
  toolSets?: PermissionToolSetsInput,
): PermissionPolicy {
  const { fileWriteTools } = resolvePermissionToolSets(toolSets)
  const rules: PermissionPolicy['rules'] = [
    {
      name: 'deny-root-removal',
      effect: 'deny',
      match: {
        tools: ['bash'],
        condition: (ctx) => {
          const command = String(ctx.args.command ?? '')
          return ROOT_REMOVAL_PATTERN.test(command)
        },
      },
      denyReason: 'Recursive removal of root or home directory is never allowed',
    },
  ]

  if (fileWriteTools.size > 0) {
    rules.unshift({
      name: 'deny-protected-file-writes',
      effect: 'deny',
      match: {
        tools: [...fileWriteTools],
        paths: PROTECTED_PATH_PATTERNS,
      },
      denyReason: 'Write to protected path is never allowed',
    })
  }

  return {
    name: 'builtin::non-bypassable-safety',
    priority: -10000,
    enabled: true,
    scope: { agents: ['*'] },
    rules,
  }
}

export const FILE_GUARD_POLICY: PermissionPolicy = {
  ...createFileGuardPolicy(),
}

export function createNetworkSafetyPolicy(toolSets?: PermissionToolSetsInput): PermissionPolicy {
  const { networkTools } = resolvePermissionToolSets(toolSets)

  return {
    name: 'builtin::network-safety',
    priority: -9000,
    enabled: true,
    scope: { agents: ['*'] },
    rules:
      networkTools.size > 0
        ? [
            {
              name: 'deny-blocked-network-targets',
              effect: 'deny',
              match: {
                tools: [...networkTools],
                condition: (ctx) => (ctx.urls ?? []).some(isBlockedNetworkUrl),
              },
              denyReason: 'Network target is blocked by safety policy',
            },
          ]
        : [],
  }
}

export function createFileGuardPolicy(toolSets?: PermissionToolSetsInput): PermissionPolicy {
  const { fileWriteTools } = resolvePermissionToolSets(toolSets)

  return {
    name: 'builtin::file-guard',
    priority: 10,
    enabled: true,
    scope: { agents: ['*'] },
    rules:
      fileWriteTools.size > 0
        ? [
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
          ]
        : [],
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
            const filePaths = ctx.filePaths ?? (ctx.filePath ? [ctx.filePath] : [])
            return (
              filePaths.length > 0 && filePaths.every((filePath) => filePath.startsWith(allowedDir))
            )
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

function getStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)
}

function getSidechainPolicy(context: PermissionContext): Record<string, unknown> | undefined {
  const sidechain = context.metadata.sidechain
  if (!sidechain || typeof sidechain !== 'object' || Array.isArray(sidechain)) {
    return undefined
  }

  const policy = (sidechain as Record<string, unknown>).policy
  if (!policy || typeof policy !== 'object' || Array.isArray(policy)) {
    return undefined
  }

  return policy as Record<string, unknown>
}

function isPathInsideRoot(rawPath: string, workspaceRoot: string): boolean {
  const root = path.resolve(workspaceRoot)
  const target = path.isAbsolute(rawPath) ? path.resolve(rawPath) : path.resolve(root, rawPath)
  const relative = path.relative(root, target)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

function hasSidechainWorkspaceEscape(context: PermissionContext): boolean {
  const policy = getSidechainPolicy(context)
  const workspaceRoot = policy?.workspaceRoot
  if (typeof workspaceRoot !== 'string' || workspaceRoot.length === 0) {
    return false
  }

  const filePaths = context.filePaths ?? (context.filePath ? [context.filePath] : [])
  return filePaths.some((filePath) => !isPathInsideRoot(filePath, workspaceRoot))
}

export function createSidechainBoundaryPolicy(): PermissionPolicy {
  return {
    name: 'builtin::sidechain-boundary',
    priority: 18,
    enabled: true,
    scope: { agents: ['*'] },
    rules: [
      {
        name: 'deny-sidechain-denied-tools',
        effect: 'deny',
        match: {
          condition: (ctx) => {
            const policy = getSidechainPolicy(ctx)
            return getStringArray(policy?.deniedTools).includes(ctx.toolName)
          },
        },
        denyReason: 'Tool denied by sidechain policy',
      },
      {
        name: 'deny-sidechain-undeclared-tools',
        effect: 'deny',
        match: {
          condition: (ctx) => {
            const policy = getSidechainPolicy(ctx)
            const allowedTools = getStringArray(policy?.allowedTools)
            return (
              policy?.permissionMode === 'restricted' &&
              allowedTools.length > 0 &&
              !allowedTools.includes(ctx.toolName)
            )
          },
        },
        denyReason: 'Tool not allowed by sidechain policy',
      },
      {
        name: 'deny-sidechain-workspace-escape',
        effect: 'deny',
        match: { condition: hasSidechainWorkspaceEscape },
        denyReason: 'Path outside sidechain workspace root',
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
