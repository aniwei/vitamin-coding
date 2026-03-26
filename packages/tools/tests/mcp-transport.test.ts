// @vitamin/tools MCP Transport 测试
// 测试 StdioTransport Content-Length 消息帧解析和发送
// 以及 SseTransport 的构建

import { describe, expect, it } from 'vitest'
import { StdioTransport, SseTransport, createStdioTransport, createSseTransport } from '../src/mcp/transport'

describe('StdioTransport', () => {
  describe('#constructor', () => {
    it('#then 可以用命令和参数创建', () => {
      const transport = new StdioTransport('echo', ['hello'], { FOO: 'bar' })
      expect(transport).toBeInstanceOf(StdioTransport)
    })
  })

  describe('#send before start', () => {
    it('#then throws when not connected', () => {
      const transport = new StdioTransport('echo')
      expect(() => {
        transport.send({ jsonrpc: '2.0', id: 1, method: 'test' })
      }).toThrow('not connected')
    })
  })

  describe('#onMessage', () => {
    it('#then registers handler without error', () => {
      const transport = new StdioTransport('echo')
      transport.onMessage(() => {})
      // 只验证不会抛异常
    })
  })

  describe('#close before start', () => {
    it('#then resolves without error', async () => {
      const transport = new StdioTransport('echo')
      await transport.close()
    })
  })

  describe('#message framing — 通过真实进程测试 Content-Length 解析', () => {
    it('#then 接收 echo 进程返回的消息帧并正确解析', async () => {
      // 使用 node 子进程模拟一个简化的 MCP server:
      // 输出一条 Content-Length 消息帧到 stdout
      const jsonBody = JSON.stringify({ jsonrpc: '2.0', id: 1, result: { ok: true } })
      const script = `
        const body = '${jsonBody}';
        const header = 'Content-Length: ' + Buffer.byteLength(body, 'utf-8') + '\\r\\n\\r\\n';
        process.stdout.write(header + body);
        // 给时间让 transport 接收
        setTimeout(() => process.exit(0), 100);
      `

      const transport = createStdioTransport('node', ['-e', script])

      const received: unknown[] = []
      transport.onMessage((msg) => {
        received.push(msg)
      })

      await transport.start()

      // 等待消息被接收
      await new Promise((resolve) => setTimeout(resolve, 300))

      expect(received).toHaveLength(1)
      expect(received[0]).toEqual({ jsonrpc: '2.0', id: 1, result: { ok: true } })

      await transport.close()
    })

    it('#then 正确解析多条连续消息帧', async () => {
      const msg1 = JSON.stringify({ jsonrpc: '2.0', id: 1, result: 'first' })
      const msg2 = JSON.stringify({ jsonrpc: '2.0', id: 2, result: 'second' })
      const script = `
        function frame(body) {
          return 'Content-Length: ' + Buffer.byteLength(body, 'utf-8') + '\\r\\n\\r\\n' + body;
        }
        process.stdout.write(frame('${msg1}') + frame('${msg2}'));
        setTimeout(() => process.exit(0), 100);
      `

      const transport = createStdioTransport('node', ['-e', script])

      const received: unknown[] = []
      transport.onMessage((msg) => received.push(msg))

      await transport.start()
      await new Promise((resolve) => setTimeout(resolve, 300))

      expect(received).toHaveLength(2)
      expect(received[0]).toEqual({ jsonrpc: '2.0', id: 1, result: 'first' })
      expect(received[1]).toEqual({ jsonrpc: '2.0', id: 2, result: 'second' })

      await transport.close()
    })

    it('#then 发送消息生成正确的 Content-Length 帧', async () => {
      // 子进程读取 stdin 并将收到的内容 echo 回 stdout（打包为 Content-Length 帧）
      const script = `
        let buf = '';
        process.stdin.setEncoding('utf-8');
        process.stdin.on('data', (chunk) => {
          buf += chunk;
          // 简单解析: 找到 \\r\\n\\r\\n 后读 body
          const idx = buf.indexOf('\\r\\n\\r\\n');
          if (idx === -1) return;
          const header = buf.slice(0, idx);
          const m = header.match(/Content-Length:\\s*(\\d+)/i);
          if (!m) return;
          const len = parseInt(m[1], 10);
          const bodyStart = idx + 4;
          if (buf.length < bodyStart + len) return;
          const body = buf.slice(bodyStart, bodyStart + len);
          buf = buf.slice(bodyStart + len);
          // 输出 reply
          const reply = JSON.stringify({ jsonrpc: '2.0', id: JSON.parse(body).id, result: 'echo' });
          const frame = 'Content-Length: ' + Buffer.byteLength(reply, 'utf-8') + '\\r\\n\\r\\n' + reply;
          process.stdout.write(frame);
        });
        setTimeout(() => process.exit(0), 2000);
      `

      const transport = createStdioTransport('node', ['-e', script])

      const received: unknown[] = []
      transport.onMessage((msg) => received.push(msg))

      await transport.start()

      transport.send({ jsonrpc: '2.0', id: 42, method: 'ping' })

      await new Promise((resolve) => setTimeout(resolve, 500))

      expect(received).toHaveLength(1)
      expect(received[0]).toEqual({ jsonrpc: '2.0', id: 42, result: 'echo' })

      await transport.close()
    })
  })
})

describe('SseTransport', () => {
  describe('#constructor', () => {
    it('#then 可以用 URL 创建', () => {
      const transport = new SseTransport('http://localhost:9999/mcp')
      expect(transport).toBeInstanceOf(SseTransport)
    })
  })

  describe('#close before start', () => {
    it('#then resolves without error', async () => {
      const transport = createSseTransport('http://localhost:9999/mcp')
      await transport.close()
    })
  })
})

describe('Factory functions', () => {
  it('#createStdioTransport returns StdioTransport', () => {
    expect(createStdioTransport('echo')).toBeInstanceOf(StdioTransport)
  })

  it('#createSseTransport returns SseTransport', () => {
    expect(createSseTransport('http://localhost:9999')).toBeInstanceOf(SseTransport)
  })
})
