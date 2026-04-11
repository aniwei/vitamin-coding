import { readdir, readFile } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import { VITAMIN_HOME } from '@vitamin/env'

import type { PromptTemplate, ResourceDiagnostic } from './resource-manager'
import type { PromptTemplateSource, PromptTemplateResult } from './types'

export interface FilesystemPromptTemplateSourceOptions {
  workspaceDir?: string
  promptDirs?: string[]
}

export class FilesystemPromptTemplateSource implements PromptTemplateSource {
  private workspaceDir: string
  private dynamicPromptDirs: string[]

  constructor(options: FilesystemPromptTemplateSourceOptions = {}) {
    this.workspaceDir = options.workspaceDir ?? process.cwd()
    this.dynamicPromptDirs = [...(options.promptDirs ?? [])]
  }

  setPromptDirs(promptDirs: string[]): void {
    this.dynamicPromptDirs = [...promptDirs]
  }

  async load(): Promise<PromptTemplateResult> {
    const templates: PromptTemplate[] = []
    const diagnostics: ResourceDiagnostic[] = []
    const seenNames = new Map<string, string>()

    const dirs: Array<{ path: string; source: 'user' | 'project' }> = [
      { path: `${VITAMIN_HOME}/prompts`, source: 'user' },
      { path: `${this.workspaceDir}/.vitamin/prompts`, source: 'project' },
    ]

    for (const dir of this.dynamicPromptDirs) {
      dirs.push({ path: dir, source: 'project' })
    }

    for (const dir of dirs) {
      const discovered = await this.discoverPromptFiles(dir.path, dir.source)

      for (const template of discovered.templates) {
        const existing = seenNames.get(template.name)
        if (existing) {
          diagnostics.push({
            type: 'collision',
            category: 'prompt',
            name: template.name,
            filePath: template.filePath,
            message: `Prompt "${template.name}" already loaded from ${existing}`,
          })
          continue
        }

        seenNames.set(template.name, template.filePath)
        templates.push(template)
      }

      diagnostics.push(...discovered.diagnostics)
    }

    return { templates, diagnostics }
  }

  private async discoverPromptFiles(
    dir: string,
    source: 'user' | 'project',
  ): Promise<{
    templates: PromptTemplate[]
    diagnostics: ResourceDiagnostic[]
  }> {
    const templates: PromptTemplate[] = []
    const diagnostics: ResourceDiagnostic[] = []

    try {
      let entries: string[]
      try {
        entries = (await readdir(dir)).filter((entry) => extname(entry) === '.md')
      } catch {
        return { templates, diagnostics }
      }

      for (const entry of entries) {
        const filePath = join(dir, entry)
        try {
          const content = await readFile(filePath, 'utf-8')
          templates.push({
            name: basename(entry, '.md'),
            content: content.trim(),
            filePath,
            source,
          })
        } catch (error) {
          diagnostics.push({
            type: 'error',
            category: 'prompt',
            name: basename(entry, '.md'),
            filePath,
            message: `Failed to read prompt file: ${error instanceof Error ? error.message : String(error)}`,
          })
        }
      }
    } catch {
      return { templates, diagnostics }
    }

    return { templates, diagnostics }
  }
}

export class InMemoryPromptTemplateSource implements PromptTemplateSource {
  private readonly templates: PromptTemplate[]

  constructor(templates?: PromptTemplate[]) {
    this.templates = templates ?? []
  }

  async load(): Promise<PromptTemplateResult> {
    return {
      templates: this.templates,
      diagnostics: [],
    }
  }
}
