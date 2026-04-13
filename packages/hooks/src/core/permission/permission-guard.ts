import { ToolError } from '@vitamin/shared'

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
    const context: PermissionContext = {
      timing: 'tool.execute.before',
      toolName: input.toolName,
      args: input.args,
      agentName: input.agentName,
      sessionId: input.sessionId,
      filePath: this.extractPath(input.args),
      metadata: {},
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

  private extractPath(args: Record<string, unknown>): string | undefined {
    if (typeof args.path === 'string') return args.path
    if (typeof args.file_path === 'string') return args.file_path
    if (typeof args.filePath === 'string') return args.filePath
    return undefined
  }
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
