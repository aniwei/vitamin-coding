import type { Task, TaskInput, TaskStatus } from './types'

export class TaskStore {
  private readonly tasks = new Map<string, Task>()
  private nextId = 1

  private generateId(): string {
    return `task_${Date.now()}_${this.nextId++}`
  }

  async create(input: TaskInput): Promise<Task> {
    const task: Task = {
      id: this.generateId(),
      status: 'pending',
      sessionPolicy: input.sessionMode ?? 'ephemeral',
      attempts: 0,
      maxAttempts: 3,
      input,
      createdAt: Date.now(),
    }

    this.tasks.set(task.id, task)
    return task
  }

  async get(id: string): Promise<Task | undefined> {
    return this.tasks.get(id)
  }

  async list(filter?: { status?: TaskStatus; parentId?: string }): Promise<Task[]> {
    let result = [...this.tasks.values()]
    if (filter?.status) {
      result = result.filter(t => t.status === filter.status)
    }
    if (filter?.parentId) {
      result = result.filter(t => t.parentId === filter.parentId)
    }
    return result
  }

  async update(
    id: string, 
    patch: Partial<Pick<Task, 'status' | 'output' | 'error' | 'attempts' | 'completedAt' | 'sessionId'>>
  ): Promise<void> {
    const task = this.tasks.get(id)
    if (!task) {
      throw new Error(`Task not found: ${id}`)
    }

    Object.assign(task, patch)
  }

  async delete(id: string): Promise<boolean> {
    return this.tasks.delete(id)
  }
}
