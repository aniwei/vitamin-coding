import { z } from 'zod'
import {
  exists,
  isFile,
  normalizePath,
} from '@vitamin/shared'
import { resolve } from 'node:path'
import { readFile, writeFile } from 'node:fs/promises'

import type { AgentTool, ToolResult } from '@vitamin/agent'
import { diff } from 'node:util'

// 参数 schema
const EditArgsSchema = z.object({
  path: z.string().describe('Path to the file to edit (relative or absolute)'),
  oldContent: z.string().describe('Exact text to find and replace'),
  newContent: z.string().describe('New text to replace oldContent'),
}).superRefine((args, ctx) => {
  const oldValue = args.oldContent
  const newValue = args.newContent

  if (oldValue === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Missing old content text.',
      path: ['oldContent'],
    })
  }

  if (newValue === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Missing new content text.',
      path: ['newContent'],
    })
  }
})

export type EditArgs = z.infer<typeof EditArgsSchema>

type LineEnding = '\r\n' | '\n'


interface FuzzyMatch {
  found: boolean
  index: number
  matchLength: number
  usedFuzzyMatch: boolean
  contentForReplacement: string
}

function normalizeUnicodePunctuation(content: string): string {
  return content
    .split('\n').map((line) => line.trimEnd()).join('\n')
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212]/g, '-')
    .replace(/[\u00A0\u2002-\u200A\u202F\u205F\u3000]/g, ' ')
}

const normalizeLineEndings = (content: string): string => {
  return content.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

export function fuzzyMatch(
  content: string, 
  oldContent: string
): FuzzyMatch {
	const exactIndex = content.indexOf(oldContent)
  
	if (exactIndex !== -1) {
		return {
			found: true,
			index: exactIndex,
			matchLength: oldContent.length,
			usedFuzzyMatch: false,
			contentForReplacement: content,
		}
	}

	const fuzzyContent = normalizeUnicodePunctuation(content)
	const fuzzyOldContent = normalizeUnicodePunctuation(oldContent)
	const fuzzyIndex = fuzzyContent.indexOf(fuzzyOldContent)

	if (fuzzyIndex === -1) {
		return {
			found: false,
			index: -1,
			matchLength: 0,
			usedFuzzyMatch: false,
			contentForReplacement: content,
		}
	}

	return {
		found: true,
		index: fuzzyIndex,
		matchLength: fuzzyOldContent.length,
		usedFuzzyMatch: true,
		contentForReplacement: fuzzyContent,
	};
}

// 创建 edit 工具
export function createEdit(projectRoot: string): AgentTool<EditArgs> {
  

  return {
    name: 'edit',
    description: 'Edit a file by replacing exact text using oldContent/content.',
    parameters: EditArgsSchema,
    visibility: 'always',
    execute: async ({ args, signal }): Promise<ToolResult> => {
      const oldContent = args.oldContent
      const newContent = args.newContent

      if (oldContent === undefined) {
        throw new Error('Missing oldContent')
      }

      if (newContent === undefined) {
        throw new Error('Missing content')
      }

      const resolvedPath = resolve(projectRoot, args.path)
      const normalizedPath = normalizePath(resolvedPath)

      if (!await exists(normalizedPath)) {
        throw new Error(`File not found: ${args.path}`)
      }

      if (!await isFile(normalizedPath)) {
        throw new Error(`Not a file: ${args.path}`)
      }

      const raw = await readFile(normalizedPath, 'utf-8')

      if (signal.aborted) {
        throw new Error('Operation aborted')
      }

      const { bom, content: stripedContent } = raw.startsWith('\uFEFF') 
        ? { bom: '\uFEFF', content: raw.slice(1) }
        : { bom: '', content: raw }

      const crlf = stripedContent.indexOf('\r\n')
      const lf = stripedContent.indexOf('\n')

      let lineEnding: LineEnding = '\n'
      if (lf === -1) {
        lineEnding = '\n'
      } else if (crlf === -1) {
        lineEnding = '\n'
      } else {
        lineEnding = crlf < lf ? '\r\n' : '\n'
      }

      const normalizedContent = normalizeLineEndings(stripedContent)
      const normalizedOldContent = normalizeLineEndings(oldContent)
      const normalizedNewContent = normalizeLineEndings(newContent)

      const fuzzyMatchResult = fuzzyMatch(normalizedContent, normalizedOldContent)

      if (!fuzzyMatchResult.found) {
        throw new Error(`Could not find the exact text in ${args.path}. The old text must match exactly including all whitespace and newlines.`)
      }

      const fuzzyContent = normalizeUnicodePunctuation(normalizedContent)
      const fuzzyOldContent = normalizeUnicodePunctuation(normalizedOldContent)
      const occurrences = fuzzyContent.split(fuzzyOldContent).length - 1

      if (occurrences > 1) {
        throw new Error(`Found ${occurrences} occurrences of the text in ${args.path}. The text must be unique. Please provide more context to make it unique.`)
      }

      const replacement = fuzzyMatchResult.contentForReplacement
      const content = replacement.substring(0, fuzzyMatchResult.index) 
        + normalizedNewContent 
        + replacement.substring(fuzzyMatchResult.index + fuzzyMatchResult.matchLength)

      if (replacement === content) {
        throw new Error(`No changes made to ${args.path}. The replacement produced identical content. This might indicate an issue with special characters or the text not existing as expected.`)
      }

      const finalContent = bom + (
        lineEnding === '\r\n' 
          ? content.replace(/\n/g, '\r\n') 
          : content
      )

      await writeFile(normalizedPath, finalContent)

      return {
        content: [{ type: "text", text: `Successfully replaced text in ${args.path}.` }],
        details: { diff:  diff(replacement, content) }
      }
    }
  }
}
