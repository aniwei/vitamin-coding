import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'

export type FrontmatterErrorCode = 'missing_frontmatter' | 'invalid_yaml' | 'invalid_metadata'

export class FrontmatterParseError extends Error {
  constructor(
    message: string,
    readonly code: FrontmatterErrorCode,
    readonly filePath?: string,
  ) {
    super(message)
    this.name = 'FrontmatterParseError'
  }
}

export interface ExtractedFrontmatter {
  yaml: string
  body: string
}

export interface ParsedFrontmatter {
  metadata: Record<string, unknown>
  body: string
}

export function extractYamlFrontmatter(content: string): ExtractedFrontmatter | null {
  const lines = content.trim().split(/\r?\n/)
  if (lines[0]?.trim() !== '---') {
    return null
  }

  for (let i = 1; i < lines.length; i++) {
    if (lines[i]?.trim() === '---') {
      return {
        yaml: lines.slice(1, i).join('\n'),
        body: lines
          .slice(i + 1)
          .join('\n')
          .trim(),
      }
    }
  }

  return null
}

export function parseYamlFrontmatter(content: string, filePath?: string): ParsedFrontmatter {
  const extracted = extractYamlFrontmatter(content)
  if (!extracted) {
    throw new FrontmatterParseError(
      filePath
        ? `No valid YAML frontmatter found in "${filePath}"`
        : 'No valid YAML frontmatter found',
      'missing_frontmatter',
      filePath,
    )
  }

  let metadata: unknown
  try {
    metadata = parseYaml(extracted.yaml)
  } catch (error) {
    throw new FrontmatterParseError(
      filePath
        ? `Failed to parse YAML frontmatter in "${filePath}": ${(error as Error).message}`
        : `Failed to parse YAML frontmatter: ${(error as Error).message}`,
      'invalid_yaml',
      filePath,
    )
  }

  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    throw new FrontmatterParseError(
      filePath
        ? `YAML frontmatter in "${filePath}" is not a valid object`
        : 'YAML frontmatter is not a valid object',
      'invalid_metadata',
      filePath,
    )
  }

  return {
    metadata: metadata as Record<string, unknown>,
    body: extracted.body,
  }
}

export function serializeYamlFrontmatter(
  metadata: Record<string, unknown>,
  body: string,
): string {
  const yaml = stringifyYaml(metadata).trimEnd()
  const trimmedBody = body.trim()
  return `---\n${yaml}\n---\n\n${trimmedBody}\n`
}
