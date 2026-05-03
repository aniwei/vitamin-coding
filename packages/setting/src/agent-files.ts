import { readdir, readFile } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'

import type { AgentOptions, AgentsConfig } from './types'

export interface FileAgentProfile extends AgentOptions {
  name: string
  filePath: string
}

export interface DiscoverFileAgentsOptions {
  workspaceDir: string
  agentsDir?: string
}

export async function discoverFileAgents(
  options: DiscoverFileAgentsOptions,
): Promise<AgentsConfig> {
  const agentsDir = options.agentsDir ?? join(options.workspaceDir, '.x-mars', 'agents')
  let entries: string[]
  try {
    entries = await readdir(agentsDir)
  } catch {
    return {}
  }

  const agents: AgentsConfig = {}
  for (const entry of entries.sort()) {
    if (extname(entry) !== '.md') {
      continue
    }

    const filePath = join(agentsDir, entry)
    const content = await readFile(filePath, 'utf-8')
    const parsed = parseAgentMarkdown(content, {
      fallbackName: basename(entry, '.md'),
      filePath,
    })
    if (!parsed.disabled) {
      agents[parsed.name] = parsed
    }
  }

  return agents
}

export function parseAgentMarkdown(
  content: string,
  options: { fallbackName: string; filePath?: string },
): FileAgentProfile {
  const { frontmatter, body } = splitFrontmatter(content)
  const rawName = getString(frontmatter.name) ?? options.fallbackName
  const name = normalizeAgentName(rawName) || normalizeAgentName(options.fallbackName)

  return {
    name,
    filePath: options.filePath ?? '',
    description: getString(frontmatter.description),
    system_prompt: body.trim(),
    tools: getStringArray(frontmatter.tools),
    capabilities: getStringArray(frontmatter.capabilities),
    categories: getStringArray(frontmatter.categories),
    default_workflow_slot: getWorkflowSlot(frontmatter.default_workflow_slot ?? frontmatter.slot),
    max_tool_turns: getInteger(frontmatter.max_tool_turns ?? frontmatter.maxToolTurns),
    model: getString(frontmatter.model),
    disabled: getBoolean(frontmatter.disabled),
  }
}

function splitFrontmatter(content: string): {
  frontmatter: Record<string, unknown>
  body: string
} {
  if (!content.startsWith('---\n')) {
    return { frontmatter: {}, body: content }
  }

  const end = content.indexOf('\n---', 4)
  if (end === -1) {
    return { frontmatter: {}, body: content }
  }

  return {
    frontmatter: parseSimpleFrontmatter(content.slice(4, end)),
    body: content.slice(end + 4).replace(/^\r?\n/, ''),
  }
}

function parseSimpleFrontmatter(input: string): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const rawLine of input.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) {
      continue
    }

    const separator = line.indexOf(':')
    if (separator <= 0) {
      continue
    }

    const key = line.slice(0, separator).trim()
    const value = line.slice(separator + 1).trim()
    result[key] = parseFrontmatterValue(value)
  }
  return result
}

function parseFrontmatterValue(value: string): unknown {
  if (value === 'true') {
    return true
  }
  if (value === 'false') {
    return false
  }
  if (/^-?\d+$/.test(value)) {
    return Number(value)
  }
  if (value.startsWith('[') && value.endsWith(']')) {
    return value
      .slice(1, -1)
      .split(',')
      .map((item) => stripQuotes(item.trim()))
      .filter(Boolean)
  }
  return stripQuotes(value)
}

function stripQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1)
  }
  return value
}

function getString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function getStringArray(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    const items = value.filter((item): item is string => typeof item === 'string' && !!item.trim())
    return items.length > 0 ? items : undefined
  }
  if (typeof value === 'string' && value.trim()) {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  }
  return undefined
}

function getBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

function getInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) ? value : undefined
}

function getWorkflowSlot(value: unknown): AgentOptions['default_workflow_slot'] {
  const slot = getString(value)
  if (
    slot === 'normal' ||
    slot === 'thinking' ||
    slot === 'compact' ||
    slot === 'critique' ||
    slot === 'vision'
  ) {
    return slot
  }
  return undefined
}

function normalizeAgentName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
