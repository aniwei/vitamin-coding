import { afterEach, describe, expect, it } from 'vitest'
import { migrate, registerMigration, resetMigrations } from '../src/migrator'

// 每个测试后清理已注册的迁移，避免泄漏
afterEach(() => {
  resetMigrations()
})

describe('migrate', () => {
  describe('#given a config with no version', () => {
    it('#then treats it as version 0.0.0', () => {
      const { config, applied } = migrate({ log_level: 'info' })
      expect(applied).toHaveLength(0)
      expect(config.log_level).toBe('info')
    })
  })

  describe('#given a registered migration', () => {
    it('#then applies it and updates config_version', () => {
      registerMigration({
        version: '1.0.0',
        description: 'Add default theme',
        migrate(config) {
          return { ...config, theme: 'dark' }
        },
      })

      const { config, applied } = migrate({
        config_version: '0.0.0',
        log_level: 'info',
      })

      expect(applied).toHaveLength(1)
      expect(config.theme).toBe('dark')
      expect(config.config_version).toBe('1.0.0')
      expect(config._migrations).toBeDefined()
    })
  })

  describe('#given a multi-step migration chain', () => {
    it('#then applies all applicable migrations in order', () => {
      registerMigration({
        version: '1.0.0',
        description: 'Add theme',
        migrate(config) {
          return { ...config, theme: 'light' }
        },
      })

      registerMigration({
        version: '2.0.0',
        description: 'Rename theme to ui_theme',
        migrate(config) {
          const { theme, ...rest } = config
          return { ...rest, ui_theme: theme }
        },
      })

      registerMigration({
        version: '3.0.0',
        description: 'Add model default',
        migrate(config) {
          return { ...config, model: 'default-model' }
        },
      })

      const { config, applied } = migrate({
        config_version: '0.0.0',
      })

      // 三步迁移全部执行
      expect(applied).toHaveLength(3)
      expect(config.ui_theme).toBe('light')
      expect(config.model).toBe('default-model')
      expect(config.config_version).toBe('3.0.0')
      // theme 已被重命名，不应存在
      expect(config.theme).toBeUndefined()
    })
  })

  describe('#given a config already at latest version', () => {
    it('#then applies no migrations', () => {
      registerMigration({
        version: '1.0.0',
        description: 'Should be skipped',
        migrate(config) {
          return { ...config, theme: 'skipped' }
        },
      })

      const { config, applied } = migrate({
        config_version: '999.0.0',
      })

      expect(applied).toHaveLength(0)
      expect(config.theme).toBeUndefined()
    })
  })

  describe('#given a config between versions', () => {
    it('#then only applies newer migrations', () => {
      registerMigration({
        version: '1.0.0',
        description: 'Old migration',
        migrate(config) {
          return { ...config, old: true }
        },
      })

      registerMigration({
        version: '2.0.0',
        description: 'New migration',
        migrate(config) {
          return { ...config, new_field: true }
        },
      })

      const { config, applied } = migrate({
        config_version: '1.0.0',
      })

      // 只应用 v1 → v2，跳过 v0 → v1
      expect(applied).toHaveLength(1)
      expect(config.old).toBeUndefined()
      expect(config.new_field).toBe(true)
      expect(config.config_version).toBe('2.0.0')
    })
  })
})
