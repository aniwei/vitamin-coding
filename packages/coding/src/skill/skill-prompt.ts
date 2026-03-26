// Skill → System Prompt 格式化

import type { Skill } from './types'

// 将 Skill 列表格式化为 XML 片段，注入 Agent System Prompt
// 对齐 pi-mono 的 <available_skills> 格式：
// - 仅包含 disableModelInvocation !== true 的 Skill
// - LLM 根据 description 判断是否需要加载
// - 加载方式：调用 read 工具读取 SKILL.md 的完整内容
export function formatSkillsForPrompt(skills: Skill[]): string {
  const visible = skills.filter((s) => !s.disableModelInvocation)
  if (visible.length === 0) return ''

  const lines: string[] = [
    'The following skills provide specialized instructions for specific tasks.',
    'Use the read tool to load a skill\'s file when the task matches its description.',
    'When a skill file references a relative path, resolve it against the skill directory',
    'and use that absolute path in tool commands.',
    '',
    '<available_skills>',
  ]

  for (const skill of visible) {
    lines.push('  <skill>')
    lines.push(`    <name>${escapeXml(skill.name)}</name>`)
    lines.push(`    <description>${escapeXml(skill.description)}</description>`)
    lines.push(`    <location>${escapeXml(skill.filePath)}</location>`)
    lines.push('  </skill>')
  }

  lines.push('</available_skills>')

  return lines.join('\n')
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
