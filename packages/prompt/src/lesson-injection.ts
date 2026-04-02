import type { Lesson } from './types'

export function buildLessonInjection(lessons: Lesson[]): string {
  if (lessons.length === 0) return ''

  const lines = lessons.map((l, i) =>
    `${i + 1}. [${l.tags.join(', ')}] ${l.trigger} → ${l.insight}`
  )

  return `### Operational Lessons
以下是从之前的会话中学到的相关经验：
${lines.join('\n')}`
}

export const SESSION_END_LEARNING_PROMPT = `在会话即将结束前，回顾你在本次会话中的工作：
- 是否遇到了意外的困难或错误？
- 是否发现了有效的模式或策略？
- 是否有值得记录的经验教训？

如果有值得记录的经验，请使用 \`learn\` 工具记录下来。
每条经验应包含：
- tags: 分类标签（如 "typescript", "testing", "architecture"）
- trigger: 触发场景（什么情况下这个经验有用）
- insight: 经验内容（应该怎么做或应该避免什么）`
