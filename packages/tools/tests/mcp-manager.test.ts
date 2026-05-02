// @vitamin/tools MCP Manager 测试
// 测试多服务器管理、禁用列表、工具聚合

import { describe, expect, it } from 'vitest'
import { McpManager, createMcpManager } from '@vitamin/mcp'

describe('McpManager', () => {
  describe('#given empty manager', () => {
    it('#then connectedCount is 0', () => {
      const manager = createMcpManager()
      expect(manager.connectedCount).toBe(0)
    })

    it('#then toolCount is 0', () => {
      const manager = createMcpManager()
      expect(manager.toolCount).toBe(0)
    })

    it('#then getAllTools returns empty', () => {
      const manager = createMcpManager()
      expect(manager.getAllTools()).toHaveLength(0)
    })

    it('#then getServerInfos returns empty', () => {
      const manager = createMcpManager()
      expect(manager.getServerInfos()).toHaveLength(0)
    })
  })

  describe('#given disabledServers', () => {
    it('#then getServerInfos includes disabled servers as disconnected', () => {
      const manager = createMcpManager({}, ['disabled-a', 'disabled-b'])
      const infos = manager.getServerInfos()

      expect(infos).toHaveLength(2)
      expect(infos[0]!.name).toBe('disabled-a')
      expect(infos[0]!.status).toBe('disconnected')
      expect(infos[0]!.tools).toHaveLength(0)
      expect(infos[1]!.name).toBe('disabled-b')
      expect(infos[1]!.status).toBe('disconnected')
    })
  })

  describe('#connect with disabled server', () => {
    it('#then skips connection for disabled server', async () => {
      const manager = createMcpManager({}, ['skip-me'])

      // 连接一个被禁用的 server（不会真正尝试连接）
      await manager.connect('skip-me', { command: 'nonexistent' })

      // 不会出现在 connectedCount 里
      expect(manager.connectedCount).toBe(0)
    })
  })

  describe('#disconnectAll', () => {
    it('#then succeeds on empty manager', async () => {
      const manager = createMcpManager()
      // 不应抛出异常
      await manager.disconnectAll()
      expect(manager.connectedCount).toBe(0)
    })
  })

  describe('#connectAll with empty servers', () => {
    it('#then succeeds silently', async () => {
      const manager = createMcpManager()
      await manager.connectAll({})
      expect(manager.connectedCount).toBe(0)
    })
  })

  describe('#connect with skipOnError=true (default)', () => {
    it('#then silently skips on connection failure', async () => {
      const manager = createMcpManager({ skipOnError: true })

      // 尝试连接一个不存在的命令，应该静默失败
      await manager.connect('bad-server', { command: '__nonexistent_command_12345__' })

      expect(manager.connectedCount).toBe(0)
      expect(manager.getAllTools()).toHaveLength(0)
    })
  })

  describe('#connect with skipOnError=false', () => {
    it('#then throws on connection failure', async () => {
      const manager = createMcpManager({ skipOnError: false })

      await expect(
        manager.connect('bad-server', { command: '__nonexistent_command_12345__' }),
      ).rejects.toThrow()
    })
  })

  describe('#createMcpManager factory', () => {
    it('#then creates McpManager instance', () => {
      const manager = createMcpManager()
      expect(manager).toBeInstanceOf(McpManager)
    })

    it('#then passes options correctly', () => {
      const manager = createMcpManager({ requestTimeoutMs: 5000 }, ['x'])
      const infos = manager.getServerInfos()
      expect(infos).toHaveLength(1)
      expect(infos[0]!.name).toBe('x')
    })
  })

  describe('#onToolsChanged callback', () => {
    it('#then can register callback without error', () => {
      const manager = createMcpManager()
      let called = false
      manager.onToolsChanged(() => { called = true })
      // 只验证注册不报错；触发需要真实 server 通知
      expect(called).toBe(false)
    })
  })
})
