/**
 * chat.routes.ts —— Hono 版聊天路由（完整内联，无 Next.js 依赖）
 *
 * 与原 src/app/api/chat/ 逻辑等价，仅替换：
 *   - getSession()   → c.get('session')（requireAuth 中间件注入）
 *   - request.signal → c.req.raw.signal
 *   - 不引用 auth/server、next/headers、'use server' 文件
 *
 * 包含路由：
 *   GET  /models
 *   POST /title
 *   POST /           (主流式聊天)
 *   POST /temporary
 *   POST /export
 *   POST /openai-realtime
 */
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  smoothStream,
  stepCountIs,
  streamText,
  type Tool,
  type UIMessage,
} from 'ai'
import { colorize } from 'consola/utils'
import { Hono } from 'hono'

import type { AppEnv } from '../app'
import { requireAuth } from '../middleware/require-auth'

import {
  agentRepository,
  chatExportRepository,
  chatRepository,
  mcpMcpToolCustomizationRepository,
  mcpServerCustomizationRepository,
  userRepository,
} from 'lib/db/repository'
import globalLogger from 'logger'
import { customModelProvider, isToolCallUnsupportedModel } from 'lib/ai/models'
import {
  CREATE_THREAD_TITLE_PROMPT,
  buildMcpServerCustomizationsSystemPrompt,
  buildUserSystemPrompt,
  buildToolCallUnsupportedModelSystemPrompt,
  buildSpeechSystemPrompt,
} from 'lib/ai/prompts'
import { chatApiSchemaRequestBodySchema, type ChatMention, type ChatMetadata } from 'app-types/chat'
import type { ChatModel } from 'app-types/chat'
import { ChatExportByThreadIdSchema } from 'app-types/chat-export'
import type { McpServerCustomizationsPrompt } from 'app-types/mcp'
import { errorIf, safe } from 'ts-safe'
import { serverCache } from 'lib/cache'
import { CacheKeys } from 'lib/cache/cache-keys'
import { generateUUID } from 'lib/utils'
import { nanoBananaTool, openaiImageTool } from 'lib/ai/tools/image'
import { ImageToolName } from 'lib/ai/tools'
import { serverFileStorage } from 'lib/file-storage'
import { DEFAULT_VOICE_TOOLS } from 'lib/ai/speech'

import {
  excludeToolExecution,
  handleError,
  manualToolExecuteByLastMessage,
  mergeSystemPrompt,
  extractInProgressToolPart,
  filterMcpServerCustomizations,
  loadMcpTools,
  loadWorkFlowTools,
  loadAppDefaultTools,
  convertToSavePart,
} from '../../../src/app/api/chat/shared.chat'

const logger = globalLogger.withDefaults({
  message: colorize('blackBright', `Chat API: `),
})

// ─── framework-agnostic helpers (inlined from actions.ts to avoid auth/server import) ───

async function rememberAgentAction(agentId: string | undefined, userId: string) {
  if (!agentId) return undefined
  const key = CacheKeys.agentInstructions(agentId)
  let cachedAgent = await serverCache.get<any>(key)
  if (!cachedAgent) {
    cachedAgent = await agentRepository.selectAgentById(agentId, userId)
    await serverCache.set(key, cachedAgent)
  }
  return cachedAgent || undefined
}

async function rememberMcpServerCustomizationsAction(userId: string) {
  const key = CacheKeys.mcpServerCustomizations(userId)
  const cached = await serverCache.get<Record<string, McpServerCustomizationsPrompt>>(key)
  if (cached) return cached

  const mcpServerCustomizations = await mcpServerCustomizationRepository.selectByUserId(userId)
  const mcpToolCustomizations = await mcpMcpToolCustomizationRepository.selectByUserId(userId)

  const serverIds: string[] = [
    ...mcpServerCustomizations.map((v) => v.mcpServerId),
    ...mcpToolCustomizations.map((v) => v.mcpServerId),
  ]

  const prompts = Array.from(new Set(serverIds)).reduce(
    (acc, serverId) => {
      const sc = mcpServerCustomizations.find((v) => v.mcpServerId === serverId)
      const tc = mcpToolCustomizations.filter((v) => v.mcpServerId === serverId)
      acc[serverId] = {
        name: sc?.serverName || tc[0]?.serverName || '',
        id: serverId,
        prompt: sc?.prompt || '',
        tools: tc.reduce(
          (t, v) => {
            t[v.toolName] = v.prompt || ''
            return t
          },
          {} as Record<string, string>,
        ),
      }
      return acc
    },
    {} as Record<string, McpServerCustomizationsPrompt>,
  )

  serverCache.set(key, prompts, 1000 * 60 * 30)
  return prompts
}

// ─── Routes ──────────────────────────────────────────────────────────────────

export const chatRoutes = new Hono<AppEnv>()

chatRoutes.use('/*', requireAuth)

/** GET /api/chat/models — 不需要鉴权，公开接口 */
chatRoutes.get('/models', async (c) => {
  const models = customModelProvider.modelsInfo.sort((a, b) => {
    if (a.hasAPIKey && !b.hasAPIKey) return -1
    if (!a.hasAPIKey && b.hasAPIKey) return 1
    return 0
  })
  return c.json(models)
})

/** POST /api/chat/title */
chatRoutes.post('/title', async (c) => {
  const session = c.get('session')!
  try {
    const json = await c.req.json()
    const { chatModel, message = 'hello', threadId } = json as {
      chatModel?: ChatModel
      message: string
      threadId: string
    }
    const result = streamText({
      model: customModelProvider.getModel(chatModel),
      system: CREATE_THREAD_TITLE_PROMPT,
      experimental_transform: smoothStream({ chunking: 'word' }),
      prompt: message,
      abortSignal: c.req.raw.signal,
      onFinish: (ctx) => {
        chatRepository
          .upsertThread({ id: threadId, title: ctx.text, userId: session.user.id })
          .catch((err) => console.error(err))
      },
    })
    return result.toUIMessageStreamResponse()
  } catch (err) {
    return c.text(handleError(err), 500)
  }
})

/** POST /api/chat — 主流式聊天 */
chatRoutes.post('/', async (c) => {
  const session = c.get('session')!
  try {
    const json = await c.req.json()
    const {
      id,
      message,
      chatModel,
      toolChoice,
      allowedAppDefaultToolkit,
      allowedMcpServers,
      imageTool,
      mentions = [],
      attachments = [],
    } = chatApiSchemaRequestBodySchema.parse(json)

    const model = customModelProvider.getModel(chatModel)

    let thread = await chatRepository.selectThreadDetails(id)
    if (!thread) {
      logger.info(`create chat thread: ${id}`)
      const newThread = await chatRepository.insertThread({ id, title: '', userId: session.user.id })
      thread = await chatRepository.selectThreadDetails(newThread.id)
    }

    if (thread!.userId !== session.user.id) {
      return new Response('Forbidden', { status: 403 })
    }

    const messages: UIMessage[] = (thread?.messages ?? []).map((m) => ({
      id: m.id,
      role: m.role,
      parts: m.parts,
      metadata: m.metadata,
    }))

    if (messages.at(-1)?.id === message.id) {
      messages.pop()
    }

    // CSV ingestion preview attachment processing
    const { buildCsvIngestionPreviewParts } = await import('lib/ai/ingest/csv-ingest')
    const ingestionPreviewParts = await buildCsvIngestionPreviewParts(attachments, (key) =>
      serverFileStorage.download(key),
    )
    if (ingestionPreviewParts.length) {
      const baseParts = [...message.parts]
      let insertionIndex = -1
      for (let i = baseParts.length - 1; i >= 0; i -= 1) {
        if ((baseParts[i] as any)?.type === 'text') {
          insertionIndex = i
          break
        }
      }
      if (insertionIndex !== -1) {
        baseParts.splice(insertionIndex, 0, ...ingestionPreviewParts)
        message.parts = baseParts
      } else {
        message.parts = [...baseParts, ...ingestionPreviewParts]
      }
    }

    // Image/file attachment merging
    if (attachments.length) {
      const firstTextIndex = message.parts.findIndex((part: any) => part?.type === 'text')
      const attachmentParts: any[] = []
      attachments.forEach((attachment) => {
        const exists = message.parts.some(
          (part: any) => part?.type === attachment.type && (part as any)?.url === attachment.url,
        )
        if (exists) return
        if (attachment.type === 'file') {
          attachmentParts.push({
            type: 'file',
            url: attachment.url,
            mediaType: attachment.mediaType,
            filename: attachment.filename,
          })
        } else if (attachment.type === 'source-url') {
          attachmentParts.push({
            type: 'source-url',
            url: attachment.url,
            mediaType: attachment.mediaType,
            title: attachment.filename,
          })
        }
      })
      if (attachmentParts.length) {
        if (firstTextIndex >= 0) {
          message.parts = [
            ...message.parts.slice(0, firstTextIndex),
            ...attachmentParts,
            ...message.parts.slice(firstTextIndex),
          ]
        } else {
          message.parts = [...message.parts, ...attachmentParts]
        }
      }
    }

    messages.push(message)

    const supportToolCall = !isToolCallUnsupportedModel(model)
    const agentId = (
      mentions.find((m) => m.type === 'agent') as Extract<ChatMention, { type: 'agent' }>
    )?.agentId
    const agent = await rememberAgentAction(agentId, session.user.id)
    if (agent?.instructions?.mentions) {
      mentions.push(...agent.instructions.mentions)
    }

    const useImageTool = Boolean((imageTool as any)?.model)
    const isToolCallAllowed =
      supportToolCall && (toolChoice !== 'none' || mentions.length > 0) && !useImageTool

    const metadata: ChatMetadata = {
      agentId: agent?.id,
      toolChoice,
      toolCount: 0,
      chatModel,
    }

    const stream = createUIMessageStream({
      execute: async ({ writer: dataStream }) => {
        const MCP_TOOLS = await safe()
          .map(errorIf(() => !isToolCallAllowed && 'Not allowed'))
          .map(() => loadMcpTools({ mentions, allowedMcpServers }))
          .orElse({})

        const WORKFLOW_TOOLS = await safe()
          .map(errorIf(() => !isToolCallAllowed && 'Not allowed'))
          .map(() => loadWorkFlowTools({ mentions, dataStream }))
          .orElse({})

        const APP_DEFAULT_TOOLS = await safe()
          .map(errorIf(() => !isToolCallAllowed && 'Not allowed'))
          .map(() => loadAppDefaultTools({ mentions, allowedAppDefaultToolkit }))
          .orElse({})

        const inProgressToolParts = extractInProgressToolPart(message)
        if (inProgressToolParts.length) {
          await Promise.all(
            inProgressToolParts.map(async (part) => {
              const output = await manualToolExecuteByLastMessage(
                part,
                { ...MCP_TOOLS, ...WORKFLOW_TOOLS, ...APP_DEFAULT_TOOLS },
                c.req.raw.signal,
              )
              part.output = output
              dataStream.write({ type: 'tool-output-available', toolCallId: part.toolCallId, output })
            }),
          )
        }

        const userPreferences = (thread?.userPreferences as any) || undefined
        const mcpServerCustomizations = await safe()
          .map(() => {
            if (Object.keys(MCP_TOOLS ?? {}).length === 0) throw new Error('No tools found')
            return rememberMcpServerCustomizationsAction(session.user.id)
          })
          .map((v: any) => filterMcpServerCustomizations(MCP_TOOLS!, v))
          .orElse({})

        const systemPrompt = mergeSystemPrompt(
          buildUserSystemPrompt(session.user as any, userPreferences, agent),
          buildMcpServerCustomizationsSystemPrompt(mcpServerCustomizations),
          !supportToolCall && buildToolCallUnsupportedModelSystemPrompt,
        )

        const IMAGE_TOOL: Record<string, Tool> = useImageTool
          ? { [ImageToolName]: (imageTool as any)?.model === 'google' ? nanoBananaTool : openaiImageTool }
          : {}

        const vercelAITools = safe({ ...MCP_TOOLS, ...WORKFLOW_TOOLS })
          .map((t: any) => {
            const bindingTools =
              toolChoice === 'manual' || (message.metadata as ChatMetadata)?.toolChoice === 'manual'
                ? excludeToolExecution(t)
                : t
            return { ...bindingTools, ...APP_DEFAULT_TOOLS, ...IMAGE_TOOL }
          })
          .unwrap()

        metadata.toolCount = Object.keys(vercelAITools).length

        logger.info(
          `${agent ? `agent: ${agent.name}, ` : ''}tool mode: ${toolChoice}, mentions: ${mentions.length}`,
        )
        logger.info(`model: ${chatModel?.provider}/${chatModel?.model}`)

        const result = streamText({
          model,
          system: systemPrompt,
          messages: convertToModelMessages(messages),
          experimental_transform: smoothStream({ chunking: 'word' }),
          maxRetries: 2,
          tools: vercelAITools,
          stopWhen: stepCountIs(10),
          toolChoice: 'auto',
          abortSignal: c.req.raw.signal,
        })
        result.consumeStream()
        dataStream.merge(
          result.toUIMessageStream({
            messageMetadata: ({ part }) => {
              if (part.type === 'finish') {
                metadata.usage = part.totalUsage
                return metadata
              }
            },
          }),
        )
      },
      generateId: generateUUID,
      onFinish: async ({ responseMessage }) => {
        if (responseMessage.id === message.id) {
          await chatRepository.upsertMessage({
            threadId: thread!.id,
            ...responseMessage,
            parts: responseMessage.parts.map(convertToSavePart),
            metadata,
          })
        } else {
          await chatRepository.upsertMessage({
            threadId: thread!.id,
            role: message.role,
            parts: message.parts.map(convertToSavePart),
            id: message.id,
          })
          await chatRepository.upsertMessage({
            threadId: thread!.id,
            role: responseMessage.role,
            id: responseMessage.id,
            parts: responseMessage.parts.map(convertToSavePart),
            metadata,
          })
        }
        if (agent) {
          agentRepository.updateAgent(agent.id, session.user.id, { updatedAt: new Date() } as any)
        }
      },
      onError: handleError,
      originalMessages: messages,
    })

    return createUIMessageStreamResponse({ stream })
  } catch (error: any) {
    logger.error(error)
    return Response.json({ message: error.message }, { status: 500 })
  }
})

/** POST /api/chat/temporary */
chatRoutes.post('/temporary', async (c) => {
  const session = c.get('session')!
  try {
    const json = await c.req.json()
    const { messages, chatModel, instructions } = json as {
      messages: any[]
      chatModel?: { provider: string; model: string }
      instructions?: string
    }
    const model = customModelProvider.getModel(chatModel as any)
    const userPreferences = (await userRepository.getPreferences(session.user.id)) || undefined
    return streamText({
      model,
      system: `${buildUserSystemPrompt(session.user as any, userPreferences as any)} ${instructions ? `\n\n${instructions}` : ''}`.trim(),
      messages: convertToModelMessages(messages as any),
      experimental_transform: smoothStream({ chunking: 'word' }),
    }).toUIMessageStreamResponse()
  } catch (error: any) {
    return c.text(error.message || 'Oops, an error occurred!', 500)
  }
})

/** POST /api/chat/export */
chatRoutes.post('/export', async (c) => {
  const session = c.get('session')!
  try {
    const { threadId, expiresAt } = ChatExportByThreadIdSchema.parse(await c.req.json())
    const isAccess = await chatRepository.checkAccess(threadId, session.user.id)
    if (!isAccess) return c.text('Unauthorized', 401)
    await chatExportRepository.exportChat({
      threadId,
      exporterId: session.user.id,
      expiresAt: expiresAt ?? undefined,
    })
    return c.json({ message: 'Chat exported successfully' })
  } catch (error: any) {
    return c.json({ error: error.message || 'Failed to export chat' }, 500)
  }
})

/** POST /api/chat/openai-realtime */
chatRoutes.post('/openai-realtime', async (c) => {
  const session = c.get('session')!
  if (!process.env.OPENAI_API_KEY) return c.json({ error: 'OPENAI_API_KEY is not set' }, 500)
  try {
    const { voice, mentions = [], agentId } = (await c.req.json()) as {
      voice: string
      agentId?: string
      mentions: any[]
    }

    const agent = await rememberAgentAction(agentId, session.user.id)
    const enabledMentions = agent ? agent.instructions.mentions : mentions
    const allowedMcpTools = await loadMcpTools({ mentions: enabledMentions })
    const userPreferences = (await userRepository.getPreferences(session.user.id)) || undefined

    const mcpServerCustomizations = await safe()
      .map(() => {
        if (Object.keys(allowedMcpTools ?? {}).length === 0) throw new Error('No tools found')
        return rememberMcpServerCustomizationsAction(session.user.id)
      })
      .map((v: any) => filterMcpServerCustomizations(allowedMcpTools!, v))
      .orElse({})

    const openAITools = Object.entries(allowedMcpTools ?? {}).map(([name, tool]) => ({
      type: 'function',
      name,
      description: (tool as any).description,
      parameters: (tool as any).parameters,
    }))

    const systemPrompt = mergeSystemPrompt(
      buildSpeechSystemPrompt(session.user as any, userPreferences as any, agent),
      buildMcpServerCustomizationsSystemPrompt(mcpServerCustomizations),
    )

    const r = await fetch('https://api.openai.com/v1/realtime/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-realtime-preview',
        voice: voice || 'alloy',
        input_audio_transcription: { model: 'whisper-1' },
        instructions: systemPrompt,
        tools: [...openAITools, ...DEFAULT_VOICE_TOOLS],
      }),
    })

    return new Response(r.body, { status: 200, headers: { 'Content-Type': 'application/json' } })
  } catch (error: any) {
    return c.json({ error: error.message }, 500)
  }
})
