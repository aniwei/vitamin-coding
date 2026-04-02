// write_todos 工具 — 轻量级计划管理
import { z } from 'zod'

import type { AgentTool, ToolResult } from '@vitamin/agent'

const TodoItemSchema = z.object({
  id: z.string().describe('Unique todo identifier'),
  title: z.string().describe('Short description of the task'),
  status: z.enum(['pending', 'in_progress', 'done', 'skipped']).describe('Current status'),
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
}) => Promise<{ success: boolean; todos: TodoItem[] }>

export function createWriteTodos(writeTodos?: WriteTodos): AgentTool<WriteTodosArgs> {
  // In-memory store as default
  let store: TodoItem[] = []

  const defaultWriteTodos: WriteTodos = async ({ action, todos }) => {
    if (action === 'set') {
      store = [...todos]
    } else {
      const map = new Map(store.map(t => [t.id, t]))
      for (const todo of todos) {
        map.set(todo.id, todo)
      }
      store = [...map.values()]
    }
    return { success: true, todos: store }
  }

  const handler = writeTodos ?? defaultWriteTodos

  return {
    name: 'write_todos',
    description: 'Manage a lightweight todo list for planning. Use "set" to replace all todos, "update" to merge changes by id.',
    parameters: WriteTodosArgsSchema,
    visibility: 'always',

    async execute({ params }): Promise<ToolResult> {
      const result = await handler({
        action: params.action,
        todos: params.todos,
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
