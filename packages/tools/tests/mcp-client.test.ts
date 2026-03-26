// @vitamin/tools MCP Client 测试
// 测试 McpClient 生命周期、状态管理、协议握手

import { describe, expect, it } from 'vitest'
import { McpClient, createMcpClient } from '../src/mcp/mcp-client'

describe('McpClient', () => {
  describe('#constructor', () => {
    it('#then initial status is disconnected', () => {
      const client = createMcpClient('test', { command: 'echo' })
      expect(client.getStatus()).toBe('disconnected')
    })

    it('#then initial tools is empty', () => {
      const client = createMcpClient('test', { command: 'echo' })
      expect(client.getTools()).toHaveLength(0)
    })

    it('#then serverName is set', () => {
      const client = createMcpClient('my-server', { command: 'echo' })
      expect(client.serverName).toBe('my-server')
    })

    it('#then initial serverInfo is null', () => {
      const client = createMcpClient('test', { command: 'echo' })
      expect(client.getServerInfo()).toBeNull()
    })
  })

  describe('#createMcpClient factory', () => {
    it('#then creates McpClient instance', () => {
      const client = createMcpClient('s', { command: 'echo' })
      expect(client).toBeInstanceOf(McpClient)
    })
  })

  describe('#connect with bad config', () => {
    it('#then throws when no command or url configured', async () => {
      const client = createMcpClient('empty', {})

      await expect(client.connect()).rejects.toThrow('no command or url')
    })

    it('#then status becomes error on connection failure', async () => {
      const client = createMcpClient('bad', {})
      try {
        await client.connect()
      } catch {
        // expected
      }
      expect(client.getStatus()).toBe('error')
    })
  })

  describe('#callTool when not ready', () => {
    it('#then throws MCP_NOT_READY error', async () => {
      const client = createMcpClient('test', { command: 'echo' })

      await expect(
        client.callTool({ name: 'some-tool', arguments: {} }),
      ).rejects.toThrow('not ready')
    })
  })

  describe('#disconnect', () => {
    it('#then resets status to disconnected', async () => {
      const client = createMcpClient('test', { command: 'echo' })
      await client.disconnect()
      expect(client.getStatus()).toBe('disconnected')
    })

    it('#then clears tools', async () => {
      const client = createMcpClient('test', { command: 'echo' })
      await client.disconnect()
      expect(client.getTools()).toHaveLength(0)
    })

    it('#then clears serverInfo', async () => {
      const client = createMcpClient('test', { command: 'echo' })
      await client.disconnect()
      expect(client.getServerInfo()).toBeNull()
    })
  })

  describe('#onToolsChanged', () => {
    it('#then registers callback without error', () => {
      const client = createMcpClient('test', { command: 'echo' })
      client.onToolsChanged(() => {})
      // 验证不会异常
    })
  })

  describe('#connect with simulated MCP server', () => {
    it('#then completes initialize handshake and fetches tools', async () => {
      // 使用 node 子进程模拟一个最小 MCP server
      const script = `
        let buf = '';
        process.stdin.setEncoding('utf-8');
        process.stdin.on('data', (chunk) => {
          buf += chunk;
          processBuffer();
        });

        function processBuffer() {
          while (true) {
            const idx = buf.indexOf('\\r\\n\\r\\n');
            if (idx === -1) return;
            const header = buf.slice(0, idx);
            const m = header.match(/Content-Length:\\s*(\\d+)/i);
            if (!m) { buf = buf.slice(idx + 4); continue; }
            const len = parseInt(m[1], 10);
            const bodyStart = idx + 4;
            if (buf.length < bodyStart + len) return;
            const body = buf.slice(bodyStart, bodyStart + len);
            buf = buf.slice(bodyStart + len);
            handleMessage(JSON.parse(body));
          }
        }

        function send(msg) {
          const json = JSON.stringify(msg);
          const frame = 'Content-Length: ' + Buffer.byteLength(json, 'utf-8') + '\\r\\n\\r\\n' + json;
          process.stdout.write(frame);
        }

        function handleMessage(msg) {
          if (msg.method === 'initialize') {
            send({
              jsonrpc: '2.0',
              id: msg.id,
              result: {
                protocolVersion: '2024-11-05',
                capabilities: { tools: { listChanged: true } },
                serverInfo: { name: 'test-server', version: '1.0.0' }
              }
            });
          } else if (msg.method === 'notifications/initialized') {
            // 通知，不需回复
          } else if (msg.method === 'tools/list') {
            send({
              jsonrpc: '2.0',
              id: msg.id,
              result: {
                tools: [
                  {
                    name: 'add',
                    description: 'Add two numbers',
                    inputSchema: {
                      type: 'object',
                      properties: {
                        a: { type: 'number' },
                        b: { type: 'number' }
                      },
                      required: ['a', 'b']
                    }
                  }
                ]
              }
            });
          } else if (msg.method === 'tools/call') {
            const args = msg.params.arguments || {};
            send({
              jsonrpc: '2.0',
              id: msg.id,
              result: {
                content: [{ type: 'text', text: String((args.a || 0) + (args.b || 0)) }]
              }
            });
          }
        }

        setTimeout(() => process.exit(0), 10000);
      `

      const client = createMcpClient('sim', { command: 'node', args: ['-e', script] }, {
        requestTimeoutMs: 5000,
      })

      await client.connect()

      expect(client.getStatus()).toBe('ready')
      expect(client.getServerInfo()).not.toBeNull()
      expect(client.getServerInfo()!.serverInfo.name).toBe('test-server')
      expect(client.getServerInfo()!.protocolVersion).toBe('2024-11-05')

      // 验证工具列表
      const tools = client.getTools()
      expect(tools).toHaveLength(1)
      expect(tools[0]!.name).toBe('add')
      expect(tools[0]!.description).toBe('Add two numbers')

      // 调用工具
      const result = await client.callTool({
        name: 'add',
        arguments: { a: 3, b: 7 },
      })

      expect(result.content).toHaveLength(1)
      expect(result.content[0]!.type).toBe('text')
      expect((result.content[0] as { type: 'text'; text: string }).text).toBe('10')

      await client.disconnect()
      expect(client.getStatus()).toBe('disconnected')
    }, 10_000)

    it('#then handles server error response', async () => {
      const script = `
        let buf = '';
        process.stdin.setEncoding('utf-8');
        process.stdin.on('data', (chunk) => {
          buf += chunk;
          processBuffer();
        });

        function processBuffer() {
          while (true) {
            const idx = buf.indexOf('\\r\\n\\r\\n');
            if (idx === -1) return;
            const header = buf.slice(0, idx);
            const m = header.match(/Content-Length:\\s*(\\d+)/i);
            if (!m) { buf = buf.slice(idx + 4); continue; }
            const len = parseInt(m[1], 10);
            const bodyStart = idx + 4;
            if (buf.length < bodyStart + len) return;
            const body = buf.slice(bodyStart, bodyStart + len);
            buf = buf.slice(bodyStart + len);
            handleMessage(JSON.parse(body));
          }
        }

        function send(msg) {
          const json = JSON.stringify(msg);
          const frame = 'Content-Length: ' + Buffer.byteLength(json, 'utf-8') + '\\r\\n\\r\\n' + json;
          process.stdout.write(frame);
        }

        function handleMessage(msg) {
          if (msg.method === 'initialize') {
            send({
              jsonrpc: '2.0',
              id: msg.id,
              result: {
                protocolVersion: '2024-11-05',
                capabilities: {},
                serverInfo: { name: 'err-server' }
              }
            });
          } else if (msg.method === 'notifications/initialized') {
            // 通知
          } else if (msg.method === 'tools/list') {
            send({ jsonrpc: '2.0', id: msg.id, result: { tools: [] } });
          } else if (msg.method === 'tools/call') {
            send({
              jsonrpc: '2.0',
              id: msg.id,
              error: { code: -32000, message: 'Tool execution failed' }
            });
          }
        }

        setTimeout(() => process.exit(0), 10000);
      `

      const client = createMcpClient('err', { command: 'node', args: ['-e', script] }, {
        requestTimeoutMs: 5000,
      })

      await client.connect()
      expect(client.getStatus()).toBe('ready')

      await expect(
        client.callTool({ name: 'fail', arguments: {} }),
      ).rejects.toThrow('Tool execution failed')

      await client.disconnect()
    }, 10_000)
  })
})
