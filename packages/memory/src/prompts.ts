// @vitamin/memory — 摘要 Prompt 模板

/** 初次压缩摘要模板 */
export const SUMMARIZATION_PROMPT = `You are a conversation summarizer for an AI coding assistant. Your task is to create a structured summary of the conversation that preserves all information needed to continue the work.

Create the summary in the following format:

## Goal
[What is the user trying to accomplish?]

## Constraints & Preferences
- [Any constraints, preferences, or requirements the user mentioned]

## Progress
### Done
- [x] [Completed work items]
### In Progress
- [ ] [Work in progress]

## Key Decisions
- **[Decision]**: [Brief rationale]

## Next Steps
1. [Planned next steps]

## File Operations
### Read
- [Files that were read]
### Modified
- [Files that were modified]

## Critical Context
- [Any critical context needed to continue the work]

IMPORTANT:
- Preserve exact file paths, function names, error messages, and code snippets
- Keep technical details precise — do not generalize
- Include all tool call results that affect the current state
- Note any pending or failed operations`

/** 迭代压缩 — 更新已有摘要 */
export const UPDATE_SUMMARIZATION_PROMPT = `You are updating an existing conversation summary with new information. The existing summary and new messages are provided below.

Rules:
- Preserve ALL information from the existing summary
- Move completed "In Progress" items to "Done"
- Add new work items, decisions, and context
- Update "Next Steps" to reflect current state
- Preserve exact file paths, function names, error messages
- Keep the same structured format
- If any information conflicts, use the newer version`

/** Turn Prefix 摘要 — 切在 turn 中间时为前缀生成的摘要 */
export const TURN_PREFIX_SUMMARIZATION_PROMPT = `You are summarizing the FIRST PART of an assistant turn that was split during conversation compaction. The remaining part of this turn is still in the conversation.

Create a brief summary in this format:

## Original Request
[What did the user ask for in this turn?]

## Early Progress
- [Key actions completed in the prefix portion]

## Context for Remaining Messages
- [Information needed to understand the remaining suffix messages]

Keep it concise — this will be prepended to the remaining messages of this turn.`

export const SEMANTIC_RETRIEVAL_PROMPT = `Select up to {maxResults} memory entries that are relevant to the current conversation.

Return only memory names, one per line, in relevance order. Return NONE if no memory is relevant.

<memories>
{memories}
</memories>

<conversation>
{context}
</conversation>`

export const MEMORY_EXTRACTION_PROMPT = `Extract durable memories from the conversation.

Only extract information that will likely matter in future sessions. Do not extract secrets, credentials, transient task details, or casual conversation.

Use exactly this format for each memory:

NAME: short_snake_case_name
TYPE: user | feedback | project | reference
DESCRIPTION: one sentence
CONTENT:
Specific durable memory content.
END

Return NONE if there is nothing worth remembering.

<conversation>
{conversation}
</conversation>`

// 构建完整的摘要 prompt
export function buildSummarizationPrompt(
  messages: string,
  previousSummary?: string,
  customInstructions?: string,
): string {
  const parts: string[] = []

  if (previousSummary) {
    parts.push(UPDATE_SUMMARIZATION_PROMPT)
    parts.push(`\n<existing_summary>\n${previousSummary}\n</existing_summary>`)
  } else {
    parts.push(SUMMARIZATION_PROMPT)
  }

  if (customInstructions) {
    parts.push(`\n<additional_instructions>\n${customInstructions}\n</additional_instructions>`)
  }

  parts.push(`\n<conversation>\n${messages}\n</conversation>`)

  return parts.join('\n')
}

export function buildTurnPrefixPrompt(turnPrefixMessages: string): string {
  return `${TURN_PREFIX_SUMMARIZATION_PROMPT}\n\n<turn_prefix>\n${turnPrefixMessages}\n</turn_prefix>`
}

export function buildMemoryInjection(memories: Map<string, string>): string {
  if (memories.size === 0) {
    return ''
  }

  const parts: string[] = ['<agent_memory>']

  for (const [path, content] of memories) {
    if (content.trim()) {
      parts.push(`# ${path}`)
      parts.push(content.trim())
      parts.push('')
    }
  }

  parts.push('</agent_memory>')

  parts.push('')
  parts.push(`<memory_guidelines>
When you learn something from this interaction that should be remembered, use the edit or write tool to save it back to the appropriate AGENTS.md file.

**Should remember**:
- User-specified preferences and constraints
- Patterns learned from feedback (code style, architecture preferences)
- Key tool parameters (API endpoints, non-sensitive config)
- Project-specific build/test commands

**Should NOT remember**:
- Temporary task details
- One-off Q&A
- API keys, passwords, or sensitive information
- Casual conversation
</memory_guidelines>`)

  return parts.join('\n')
}

export function buildLayeredMemoryInjection(
  entries: Array<{ name: string; type: string; content: string }>,
): string {
  if (entries.length === 0) {
    return ''
  }

  const parts: string[] = ['<agent_memory>']

  for (const entry of entries) {
    if (entry.content.trim()) {
      parts.push(`[${entry.type}] ${entry.name}`)
      parts.push(entry.content.trim())
      parts.push('')
    }
  }

  parts.push('</agent_memory>')
  return parts.join('\n')
}

// 归档摘要消息模板
export function buildArchiveReference(archivePath: string, summary: string): string {
  return `This conversation has been summarized. Full history is archived at ${archivePath} and can be accessed via the read tool if you need detailed context.

<summary>
${summary}
</summary>`
}
