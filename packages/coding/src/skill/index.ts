// @vitamin/coding — Skill 子系统

export { SkillRegistry } from './skill-registry'
export { loadSkills } from './skill-discovery'
export { formatSkillsForPrompt } from './skill-prompt'
export { parseSkillFile } from './skill-parser'
export type { ParseResult } from './skill-parser'
export { LocalSkillReader, deriveSkillName } from './local-reader'
export { RemoteSkillReader } from './remote-reader'
export type { LocalSkillReaderOptions } from './local-reader'
export type { RemoteSkillReaderOptions, RemoteSkillEntry } from './remote-reader'
export type {
  Skill,
  SkillSource,
  SkillFrontmatter,
  SkillDiagnostic,
  LoadSkillsResult,
  LoadSkillsOptions,
  SkillReader,
  SkillEntry,
  SkillContent,
} from './types'
