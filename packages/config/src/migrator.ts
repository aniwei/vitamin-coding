// 配置版本迁移系统
// 迁移链：v0 → v1 → v2 … 按顺序执行
// 迁移仅单向前进（不支持回滚）
import { compare } from 'semver'
import { createLogger } from '@vitamin/shared'

const logger = createLogger('@vitamin/config:migrator')

// 单个迁移步骤
export interface Migration {
  version: string
  description: string
  migrate(config: Record<string, unknown>): Record<string, unknown>
}

// 内置迁移注册表
let migrations: Migration[] = []

// 注册新迁移，必须按版本顺序注册
export function registerMigration(migration: Migration): void {
  migrations.push(migration)
}

// 重置迁移注册表（仅用于测试）
export function resetMigrations(): void {
  migrations = []
}

// 对配置对象执行所有适用的迁移
// 返回迁移后的配置，并更新 config_version 和 _migrations 日志
export function migrate(config: Record<string, unknown>): {
  config: Record<string, unknown>
  applied: string[]
} {
  const currentVersion = typeof config.config_version === 'string' ? config.config_version : '0.0.0'

  const applied: string[] = []
  let result = { ...config }

  for (const migration of migrations) {
    if (compare(migration.version, currentVersion) > 0) {
      result = migration.migrate(result)
      result.config_version = migration.version
      applied.push(`${currentVersion} → ${migration.version}`)
      
      logger.info({ from: currentVersion, to: migration.version }, `Applying migration: ${migration.description}`)
    }
  }

  if (applied.length > 0) {
    const existingMigrations = Array.isArray(result._migrations)
      ? (result._migrations as string[])
      : []
      
    result._migrations = [...existingMigrations, ...applied]
  }

  return { config: result, applied }
}
