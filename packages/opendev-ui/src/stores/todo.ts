import { isRecord, readString } from '@x-mars/shared/browser/data'
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

// 监听包含 todo 状态的工具执行结果
ws.on('Chat.toolResult', (message) => {
  if (!isRecord(message.data)) {return}
  const d = message.data

  const toolName = readString(d, 'toolName')
  if (
    toolName === 'write_todos' ||
    toolName === 'update_todo' ||
    toolName === 'complete_todo' ||
    toolName === 'clear_todos'
  ) {
    // 如果后端在结果中包含 todo 状态，则更新 store
    if (Array.isArray(d.todos)) {
      const items: TodoItem[] = (d.todos as RawTodoItem[]).map(mapTodoItem)
      useTodoStore.getState().setItems(items, readString(d, 'planName'))
    }
  }
})

// 监听可能携带 todo 数据的状态更新
ws.on('Session.statusUpdate', (message) => {
  if (!isRecord(message.data)) {return}
  const d = message.data
  if (!Array.isArray(d.todos)) {return}

  const items: TodoItem[] = (d.todos as RawTodoItem[]).map(mapTodoItem)
  useTodoStore.getState().setItems(items, readString(d, 'planName'))
})
