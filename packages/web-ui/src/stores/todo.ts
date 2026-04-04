import { create } from 'zustand'
import { ws } from '../api/websocket'

export interface TodoItem {
  id: string
  content: string
  status: 'pending' | 'in_progress' | 'completed'
  children?: TodoItem[]
}

interface RawTodoItem {
  id?: string
  content?: string
  title?: string
  status?: string
  children?: RawTodoItem[]
}

function mapTodoItem(t: RawTodoItem): TodoItem {
  return {
    id: t.id || String(Math.random()),
    content: t.content || t.title || '',
    status: (t.status as TodoItem['status']) || 'pending',
    children: t.children?.map(mapTodoItem),
  }
}

interface TodoStore {
  items: TodoItem[]
  planName: string | null
  visible: boolean
  setItems: (items: TodoItem[], planName?: string | null) => void
  toggleVisible: () => void
}

export const useTodoStore = create<TodoStore>((set) => ({
  items: [],
  planName: null,
  visible: true,
  setItems: (items, planName) => set({ items, planName: planName ?? null }),
  toggleVisible: () => set((s) => ({ visible: !s.visible })),
}))

// Listen for todo-related tool results that carry todo state
ws.on('tool_result', (message) => {
  const d = message.data
  if (!d) return

  const toolName = d.tool_name
  if (
    toolName === 'write_todos' ||
    toolName === 'update_todo' ||
    toolName === 'complete_todo' ||
    toolName === 'clear_todos'
  ) {
    // If the backend sends todo state in the result, update store
    if (d.todos) {
      const items: TodoItem[] = (d.todos as RawTodoItem[]).map(mapTodoItem)
      useTodoStore.getState().setItems(items, d.plan_name)
    }
  }
})

// Listen for status updates that may carry todo data
ws.on('status_update', (message) => {
  const d = message.data
  if (!d?.todos) return

  const items: TodoItem[] = (d.todos as RawTodoItem[]).map(mapTodoItem)
  useTodoStore.getState().setItems(items, d.plan_name)
})
