// write_todos 工具 — 纯 UI/记忆工具（对齐 Claude Code manage_todo_list 模式）
import { z } from 'zod'

import type { AgentTool, ToolResult } from '@vitamin/agent'

const TodoItemSchema = z.object({
  id: z.string().describe('Unique todo identifier'),
  title: z.string().describe('Short description of the task'),
  status: z.enum(['pending', 'in_progress', 'done', 'skipped', 'failed']).describe('Current status'),
})

const WriteTodosArgsSchema = z.object({
  action: z.enum(['set', 'update']).describe(
    'set: replace all todos; update: merge by id'
  ),
  todos: z.array(TodoItemSchema).describe('Todo items'),
})

type WriteTodosArgs = z.infer<typeof WriteTodosArgsSchema>

export type TodoItem = z.infer<typeof TodoItemSchema>

export type WriteTodos = (args: {
  action: 'set' | 'update'
  todos: TodoItem[]
  sessionId?: string
}) => Promise<{ success: boolean; todos: TodoItem[] }>

export function createWriteTodos(writeTodos?: WriteTodos): AgentTool<WriteTodosArgs> {
  // In-memory store as default, scoped by session to avoid cross-session leakage.
  const storeBySession = new Map<string, TodoItem[]>()

  const defaultWriteTodos: WriteTodos = async ({ action, todos, sessionId }) => {
    const sessionKey = sessionId ?? '__default__'
    let store = storeBySession.get(sessionKey) ?? []

    if (action === 'set') {
      store = [...todos]
    } else {
      const map = new Map(store.map(t => [t.id, t]))
      for (const todo of todos) {
        map.set(todo.id, todo)
      }
      store = [...map.values()]
    }

    storeBySession.set(sessionKey, store)
    return { success: true, todos: store }
  }

  const handler = writeTodos ?? defaultWriteTodos

  return {
    name: 'write_todos',
    description: 'Track progress with a lightweight todo list for UI visibility and memory. Use "set" to replace all todos, "update" to merge changes by id. This is a planning aid — it does not drive execution.',
    parameters: WriteTodosArgsSchema,
    visibility: 'always',

    async execute({ params, sessionId }): Promise<ToolResult> {
      const result = await handler({
        action: params.action,
        todos: params.todos,
        sessionId,
      })

      if (result.success) {
        const summary = result.todos
          .map(t => `[${t.status}] ${t.id}: ${t.title}`)
          .join('\n')

        return {
          content: [{ type: 'text', text: summary || '(empty todo list)' }],
          details: { todos: result.todos },
        }
      }

      return {
        content: [{ type: 'text', text: 'Failed to update todos' }],
        isError: true,
      }
    },
  }
}
