// Skill 匹配器 — 根据用户意图匹配相关 skill
// 基于 keyword 搜索 + description 匹配

import type { RegisteredSkill, SkillMatch } from './types'

/**
 * 根据用户输入文本匹配相关 skill
 * 匹配策略：
 *   1. description 关键词匹配（权重最高）
 *   2. tags 匹配
 *   3. name 匹配
 */
export function matchSkills(
  query: string,
  skills: ReadonlyMap<string, RegisteredSkill>,
  options?: { maxResults?: number; minRelevance?: number },
): SkillMatch[] {
  const maxResults = options?.maxResults ?? 5
  const minRelevance = options?.minRelevance ?? 0.1

  const queryLower = query.toLowerCase()
  const queryTokens = tokenize(queryLower)

  const matches: SkillMatch[] = []

  for (const registered of skills.values()) {
    // 跳过 disabled 和 error 状态
    if (registered.status === 'disabled' || registered.status === 'error') continue

    // 只匹配 auto-trigger 的 skill
    if (registered.definition.metadata.trigger === 'manual') continue

    const match = scoreSkill(registered, queryLower, queryTokens)
    if (match.relevance >= minRelevance) {
      matches.push(match)
    }
  }

  // 按 relevance 降序 → 按 priority 升序
  matches.sort((a, b) => {
    const relDiff = b.relevance - a.relevance
    if (Math.abs(relDiff) > 0.01) return relDiff
    return (a.skill.definition.metadata.priority ?? 100) - (b.skill.definition.metadata.priority ?? 100)
  })

  return matches.slice(0, maxResults)
}

function scoreSkill(
  registered: RegisteredSkill,
  queryLower: string,
  queryTokens: string[],
): SkillMatch {
  const { metadata } = registered.definition
  const matchedKeywords: string[] = []
  let score = 0

  // 1. Name 精确匹配（权重 0.3）
  const nameLower = metadata.name.toLowerCase()
  if (queryLower.includes(nameLower)) {
    score += 0.3
    matchedKeywords.push(metadata.name)
  } else {
    // name 部分匹配
    const nameParts = nameLower.split('-')
    for (const part of nameParts) {
      if (part.length >= 3 && queryLower.includes(part)) {
        score += 0.1
        matchedKeywords.push(part)
      }
    }
  }

  // 2. Description 关键词匹配（权重 0.5）
  const descLower = metadata.description.toLowerCase()
  const descTokens = tokenize(descLower)

  let descMatches = 0
  for (const token of queryTokens) {
    if (token.length < 3) continue
    if (descLower.includes(token)) {
      descMatches++
      matchedKeywords.push(token)
    }
  }

  if (descMatches > 0) {
    score += Math.min(0.5, (descMatches / Math.max(queryTokens.length, 1)) * 0.5)
  }

  // 3. Tags 匹配（权重 0.2）
  if (metadata.tags) {
    for (const tag of metadata.tags) {
      const tagLower = tag.toLowerCase()
      if (queryLower.includes(tagLower)) {
        score += 0.1
        matchedKeywords.push(tag)
      }
    }
    score = Math.min(score, 1.0)
  }

  // 4. 双向共词匹配奖励
  for (const descToken of descTokens) {
    if (descToken.length < 4) continue
    for (const queryToken of queryTokens) {
      if (queryToken.length < 4) continue
      if (descToken === queryToken && !matchedKeywords.includes(descToken)) {
        score += 0.05
        matchedKeywords.push(descToken)
      }
    }
  }

  return {
    skill: registered,
    relevance: Math.min(score, 1.0),
    matchedKeywords: [...new Set(matchedKeywords)],
  }
}

function tokenize(text: string): string[] {
  return text
    .split(/[\s,.:;!?()[\]{}"'`\-/\\]+/)
    .filter((w) => w.length >= 2)
}
