import type { Lesson } from './types'

export function buildLessonInjection(lessons: Lesson[], template?: string): string {
  if (lessons.length === 0) {
    return ''
  }

  const lines = lessons.map(
    (l, i) => `${i + 1}. [${l.tags.join(', ')}] ${l.trigger} → ${l.insight}`,
  )

  const t =
    template ??
    `### Runtime Lessons
The following lessons were learned from previous sessions:
{lessons}`
  return t.replace('{lessons}', lines.join('\n'))
}
