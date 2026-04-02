// Operational Learning Store — 经验提取与持久化
// LLM 通过 learn 工具写入经验，system-prompt.transform hook 注入相关经验

export interface Lesson {
  id: string
  tags: string[]
  trigger: string
  insight: string
  sourceSessionId: string
  createdAt: number
  appliedCount: number
}

export type LessonInput = Omit<Lesson, 'id' | 'createdAt' | 'appliedCount'>

export interface LessonFilter {
  tags?: string[]
  query?: string
}

export class OperationalLearningStore {
  private lessons = new Map<string, Lesson>()
  private nextId = 1

  async save(input: LessonInput): Promise<Lesson> {
    const id = `lesson_${this.nextId++}`
    const lesson: Lesson = {
      ...input,
      id,
      createdAt: Date.now(),
      appliedCount: 0,
    }
    this.lessons.set(id, lesson)
    return lesson
  }

  async search(query: string, limit = 5): Promise<Lesson[]> {
    const lowerQuery = query.toLowerCase()
    const scored: Array<{ lesson: Lesson; score: number }> = []

    for (const lesson of this.lessons.values()) {
      let score = 0
      if (lesson.trigger.toLowerCase().includes(lowerQuery)) score += 3
      if (lesson.insight.toLowerCase().includes(lowerQuery)) score += 2
      for (const tag of lesson.tags) {
        if (tag.toLowerCase().includes(lowerQuery)) score += 1
      }

      if (score > 0) {
        scored.push({ lesson, score })
      }
    }

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(s => {
        s.lesson.appliedCount++
        return s.lesson
      })
  }

  async list(filter?: LessonFilter): Promise<Lesson[]> {
    let results = [...this.lessons.values()]

    if (filter?.tags && filter.tags.length > 0) {
      const tagSet = new Set(filter.tags)
      results = results.filter(l => l.tags.some(t => tagSet.has(t)))
    }

    if (filter?.query) {
      const q = filter.query.toLowerCase()
      results = results.filter(l =>
        l.trigger.toLowerCase().includes(q) ||
        l.insight.toLowerCase().includes(q),
      )
    }

    return results
  }

  async get(id: string): Promise<Lesson | undefined> {
    return this.lessons.get(id)
  }

  async delete(id: string): Promise<boolean> {
    return this.lessons.delete(id)
  }

  get size(): number {
    return this.lessons.size
  }
}
