import { z } from 'zod'

/** 单个扩展的自由配置 */
export const ExtensionOptionsSchema = z.record(z.string(), z.unknown())

/** 扩展发现源 */
export const ExtensionSourceSchema = z.object({
  /** 扫描目录（相对于 workspaceDir 或绝对路径） */
  path: z.string(),
  /** 标识来源类型 */
  source: z.enum(['local', 'npm']).optional(),
})

export const ExtensionsConfigSchema = z.looseObject({
  /** 启用的扩展名单（白名单模式） */
  enabled: z.array(z.string()).optional(),
  /** 禁用的扩展名单（黑名单模式） */
  disabled: z.array(z.string()).optional(),
  /** 扩展包扫描路径（默认扫描 node_modules/@vitamin-ext/*） */
  paths: z.array(z.union([z.string(), ExtensionSourceSchema])).optional(),
  /** 各扩展的自定义配置, key 为扩展 name */
  options: z.record(z.string(), ExtensionOptionsSchema).optional(),
})

// 向后兼容别名
export const ExtensionConfigSchema = ExtensionOptionsSchema
