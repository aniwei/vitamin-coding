import { createSkillMcp } from './skill-mcp'
import { createSkillLoader } from './skill-loader'
import { createSkillExecutor } from './skill-executor'

export const createSkill = (options: RegisterSkillOptions) => {
  return [
    createSkillMcp(options),
    createSkillLoader(options),
    createSkillExecutor(options)
  ]
}