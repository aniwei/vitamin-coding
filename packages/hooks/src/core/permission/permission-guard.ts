import { ToolError } from '@x-mars/shared'

import { defineHook } from '../../hook-spec'
import type { HookSpec } from '../../hook-spec'
import type { ToolExecuteBeforeInput, ToolExecuteBeforeOutput } from '../../types'
import type { PermissionPolicyRegistry } from './policy-registry'
import type { PermissionAuditLog } from './audit-log'
import type { PermissionContext } from './types'

export class PermissionGuardHook {
  readonly name = 'permission-guard'
  readonly timing = 'tool.execute.before' as const
  readonly priority = 5
  public enabled = true

  private readonly registry: PermissionPolicyRegistry
  private readonly auditLog?: PermissionAuditLog

  constructor(registry: PermissionPolicyRegistry, auditLog?: PermissionAuditLog) {
    this.registry = registry
    this.auditLog = auditLog
  }

  handle = (input: ToolExecuteBeforeInput, output: ToolExecuteBeforeOutput): void => {
    const filePaths = this.extractPaths(input.args)
    const context: PermissionContext = {
      timing: 'tool.execute.before',
      toolName: input.toolName,
      args: input.args,
      agentName: input.agentName,
      sessionId: input.sessionId,
      filePath: filePaths[0],
      filePaths,
      urls: this.extractUrls(input.args),
      metadata: input.metadata ? { ...input.metadata } : {},
    }

    const decision = this.registry.evaluate(context)
    this.auditLog?.record(context, decision)

    if (decision.effect === 'deny') {
      output.cancelled = true
      output.cancelReason = `Permission denied: ${decision.reason ?? decision.ruleName}`
      throw new ToolError(output.cancelReason, { code: 'PERMISSION_DENIED' })
    }

    // 'ask' effect: 标记在 cancelReason 中，由上层消费
    // 实际确认逻辑在 UI/service 层处理
    if (decision.effect === 'ask') {
      output.cancelReason = `[CONFIRM] ${decision.reason ?? 'Requires confirmation'}`
    }
  }

  private extractPaths(args: Record<string, unknown>): string[] {
    const pathKeys = [
      'path',
      'file_path',
      'filePath',
      'oldPath',
      'old_path',
      'newPath',
      'new_path',
      'outputPath',
      'output_path',
      'targetPath',
      'target_path',
    ]
    const paths: string[] = []

    for (const key of pathKeys) {
      const value = args[key]
      if (typeof value === 'string' && !paths.includes(value)) {
        paths.push(value)
      }
    }

    return paths
  }

  private extractUrls(args: Record<string, unknown>): string[] {
    const urlKeys = ['url', 'uri', 'endpoint', 'baseUrl', 'base_url']
    const domainKeys = [
      'domain',
      'domains',
      'allowedDomains',
      'allowed_domains',
      'blockedDomains',
      'blocked_domains',
    ]
    const urls: string[] = []

    for (const key of urlKeys) {
      const value = args[key]
      if (typeof value === 'string' && !urls.includes(value)) {
        urls.push(value)
      }
    }

    for (const key of domainKeys) {
      const value = args[key]
      const domains = Array.isArray(value) ? value : typeof value === 'string' ? [value] : []
      for (const domain of domains) {
        if (typeof domain !== 'string') {
          continue
        }
        const url = normalizeDomainTarget(domain)
        if (url && !urls.includes(url)) {
          urls.push(url)
        }
      }
    }

    return urls
  }
}

function normalizeDomainTarget(value: string): string | undefined {
  const trimmed = value.trim().toLowerCase().replace(/^\*\./, '').replace(/\.$/, '')
  if (!trimmed) {
    return undefined
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) {
    return trimmed
  }
  return `https://${trimmed}`
}

export function createPermissionGuardHook(
  registry: PermissionPolicyRegistry,
  auditLog?: PermissionAuditLog,
): HookSpec {
  const hook = new PermissionGuardHook(registry, auditLog)
  return defineHook({
    name: hook.name,
    timing: hook.timing,
    priority: hook.priority,
    enabled: hook.enabled,
    handle: hook.handle,
  })
}
