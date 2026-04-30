import { create } from 'zustand'
import { ws } from '../api/websocket'

export interface TodoItem {
  id: string
  content: string
  status: 'pending' | 'inProgress' | 'completed'
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
  const status = t.status === 'inProgress' ? 'inProgress' : t.status === 'completed' ? 'completed' : 'pending'
  return {
    id: t.id || String(Math.random()),
    content: t.content || t.title || '',
    status,
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

type EventData = Record<string, unknown>

function asEventData(value: unknown): EventData | null {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as EventData
  }

  return null
}

function readString(data: EventData, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = data[key]
    if (typeof value === 'string') {
      return value
    }
  }

  return undefined
}

// Listen for todo-related tool results that carry todo state
ws.on('Chat.toolResult', (message) => {
  const d = asEventData(message.data)
  if (!d) {return}

  const toolName = readString(d, 'toolName')
  if (
    toolName === 'write_todos' ||
    toolName === 'update_todo' ||
    toolName === 'complete_todo' ||
    toolName === 'clear_todos'
  ) {
    // If the backend sends todo state in the result, update store
    if (Array.isArray(d.todos)) {
      const items: TodoItem[] = (d.todos as RawTodoItem[]).map(mapTodoItem)
      useTodoStore.getState().setItems(items, readString(d, 'planName'))
    }
  }
})

// Listen for status updates that may carry todo data
ws.on('Session.statusUpdate', (message) => {
  const d = asEventData(message.data)
  if (!d || !Array.isArray(d.todos)) {return}

  const items: TodoItem[] = (d.todos as RawTodoItem[]).map(mapTodoItem)
  useTodoStore.getState().setItems(items, readString(d, 'planName'))
})
