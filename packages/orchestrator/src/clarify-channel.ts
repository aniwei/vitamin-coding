// ═══════════════════════════════════════════════════════════
// @vitamin/orchestrator — Clarify Channel
// ═══════════════════════════════════════════════════════════
// subagent → lead/user 的受控需求澄清通道
// 不是"与 main agent 自由对话"，而是结构化地请求补充说明

// ═══ 数据模型 ═══

export type ClarifyReason = 'missing_context' | 'conflicting_constraints' | 'approval_needed'
export type ClarifyEscalation = 'lead_agent' | 'user' | 'planner'

export interface ClarifyRequest {
  id: string
  taskId: string
  parentTaskId?: string
  correlationId?: string
  question: string
  reason: ClarifyReason
  createdAt: number
}

export interface ClarifyResponse {
  requestId: string
  answer: string
  escalation?: ClarifyEscalation
  answeredAt: number
}

export type ClarifyHandler = (
  request: ClarifyRequest,
) => Promise<{ answer: string; escalation?: ClarifyEscalation }>

// Channel 接口
export interface ClarifyChannel {
  // subagent 侧：发起一个澄清请求，同步等待回复。
  // 受 maxClarifications 限制，超限则返回 error。
  request(args: {
    taskId: string
    parentTaskId?: string
    correlationId?: string
    question: string
    reason?: ClarifyReason
  }): Promise<{
    success: boolean
    answer?: string
    escalation?: ClarifyEscalation
    error?: string
  }>

  // 查看某任务的所有澄清记录
  history(taskId: string): ClarifyRequest[]

  // 查看某任务已消耗的澄清次数
  count(taskId: string): number
}


export interface ClarifyChannelOptions {
  // 每个任务最大澄清次数，默认 3
  maxClarifications?: number
  // 处理澄清请求的回调 
  handler: ClarifyHandler
}

export function createClarifyChannel(options: ClarifyChannelOptions): ClarifyChannel {
  const maxClarifications = options.maxClarifications ?? 3
  const requests = new Map<string, ClarifyRequest[]>()

  return {
    async request(args) {
      const taskId = args.taskId
      const existing = requests.get(taskId) ?? []

      if (existing.length >= maxClarifications) {
        return {
          success: false,
          error: `Max clarifications reached (${maxClarifications}). Include all available context in your result.`,
        }
      }

      const req: ClarifyRequest = {
        id: crypto.randomUUID(),
        taskId,
        parentTaskId: args.parentTaskId,
        correlationId: args.correlationId,
        question: args.question,
        reason: args.reason ?? 'missing_context',
        createdAt: Date.now(),
      }

      existing.push(req)
      requests.set(taskId, existing)

      try {
        const response = await options.handler(req)
        return {
          success: true,
          answer: response.answer,
          escalation: response.escalation,
        }
      } catch (err) {
        return {
          success: false,
          error: `Clarify handler failed: ${String(err)}`,
        }
      }
    },

    history(taskId: string) {
      return requests.get(taskId) ?? []
    },

    count(taskId: string) {
      return (requests.get(taskId) ?? []).length
    },
  }
}
