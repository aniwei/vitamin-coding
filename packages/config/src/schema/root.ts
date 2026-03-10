// VitaminConfig 及子结构的 Zod 校验模式
import { z } from 'zod'
import { AgentsConfigSchema } from './agents'
import { CategoriesConfigSchema } from './categories'
import { CompactionConfigSchema } from './compaction'
import { ExtensionsConfigSchema } from './extensions'
import { NotificationConfigSchema } from './notification'
import { SessionConfigSchema } from './session'
import { SkillsConfigSchema } from './skills'
import { ToolPresetSchema } from './tools'
import { McpConfigSchema } from './mcp'
import { BackgroundTaskConfigSchema, ExperimentalConfigSchema } from './experimental'

export const LogLevelSchema = z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal'])

export const VitaminConfigStrictSchema = z.object({
  env: z.object({
    PROJ_DIR: z.string(),
    USER_DIR: z.string(),
    PROJ_CONFIG_PATH: z.string(),
    USER_CONFIG_PATH: z.string(),
  }).optional(),
  config_version: z.string().optional(),
  version: z.string().optional(),
  log_level: LogLevelSchema.optional(),
  model: z.string().optional(),
  model_fallback: z.array(z.string()).optional(),
  theme: z.string().optional(),
  agents: AgentsConfigSchema.optional(),
  categories: CategoriesConfigSchema.optional(),
  tool_preset: ToolPresetSchema.optional(),
  extensions: ExtensionsConfigSchema.optional(),
  mcp: McpConfigSchema.optional(),
  session: SessionConfigSchema.optional(),
  skills: SkillsConfigSchema.optional(),
  compaction: CompactionConfigSchema.optional(),
  notification: NotificationConfigSchema.optional(),
  background_task: BackgroundTaskConfigSchema.optional(),
  experimental: ExperimentalConfigSchema.optional(),
  disabled_agents: z.array(z.string()).optional(),
  disabled_hooks: z.array(z.string()).optional(),
  disabled_mcps: z.array(z.string()).optional(),
  disabled_skills: z.array(z.string()).optional(),
  disabled_tools: z.array(z.string()).optional(),
  _migrations: z.array(z.string()).optional(),
})

export const VitaminConfigSchema = z.looseObject(VitaminConfigStrictSchema.shape)


export type VitaminConfigFromSchema = z.infer<typeof VitaminConfigSchema>
