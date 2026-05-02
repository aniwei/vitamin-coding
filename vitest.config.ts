import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

export default defineConfig({
  resolve: {
    alias: {
      '@x-mars/env': resolve(__dirname, 'packages/env/src/index.ts'),
      '@x-mars/invariant': resolve(__dirname, 'packages/invariant/src/index.ts'),
      '@x-mars/shared': resolve(__dirname, 'packages/shared/src/index.ts'),
      '@x-mars/dispatcher': resolve(__dirname, 'packages/dispatcher/src/index.ts'),
      '@x-mars/ai': resolve(__dirname, 'packages/ai/src/index.ts'),
      '@x-mars/setting': resolve(__dirname, 'packages/setting/src/index.ts'),
      '@x-mars/agent': resolve(__dirname, 'packages/agent/src/index.ts'),
      '@x-mars/tools': resolve(__dirname, 'packages/tools/src/index.ts'),
      '@x-mars/schema': resolve(__dirname, 'packages/schema/src/index.ts'),
      '@x-mars/hooks': resolve(__dirname, 'packages/hooks/src/index.ts'),
      '@x-mars/session': resolve(__dirname, 'packages/session/src/index.ts'),
      '@x-mars/persistence': resolve(__dirname, 'packages/persistence/src/index.ts'),
      '@x-mars/memory': resolve(__dirname, 'packages/memory/src/index.ts'),
      '@x-mars/manifest': resolve(__dirname, 'packages/manifest/src/index.ts'),
      '@x-mars/prompt': resolve(__dirname, 'packages/prompt/src/index.ts'),
      '@x-mars/orchestrator': resolve(__dirname, 'packages/orchestrator/src/index.ts'),
      '@x-mars/plan': resolve(__dirname, 'packages/plan/src/index.ts'),
      '@x-mars/resources': resolve(__dirname, 'packages/resources/src/index.ts'),
      '@x-mars/coding': resolve(__dirname, 'packages/coding/src/index.ts'),
      '@x-mars/extension': resolve(__dirname, 'packages/extension/src/index.ts'),
      '@x-mars/protocol': resolve(__dirname, 'packages/protocol/src/index.ts'),
      '@x-mars/mcp': resolve(__dirname, 'packages/mcp/src/index.ts'),
      '@x-mars/tui': resolve(__dirname, 'packages/tui/src/index.ts'),
      '@x-mars/coding-agent': resolve(__dirname, 'packages/coding-agent/src/index.ts'),
      '@x-mars/sdk': resolve(__dirname, 'packages/sdk/src/index.ts'),
      '@x-mars/swarm': resolve(__dirname, 'packages/swarm/src/index.ts'),
    },
  },
  test: {
    globals: true,
    include: ['packages/*/tests/**/*.test.ts', 'tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**/*.ts'],
      exclude: [
        'packages/*/tests/**/*.test.ts',
        'packages/*/src/**/index.ts',
        'packages/*/src/**/types.ts',
        // Provider HTTP 实现需要集成测试，不纳入单元测试覆盖率
        'packages/ai/src/providers/anthropic-messages.ts',
        'packages/ai/src/providers/bedrock-converse.ts',
        'packages/ai/src/providers/google-generative-ai.ts',
        'packages/ai/src/providers/ollama.ts',
        'packages/ai/src/providers/openai-completions.ts',
        'packages/ai/src/providers/openai-responses.ts',
        // HTTP 客户端底层依赖 fetch，需要集成测试
        'packages/ai/src/utils/http-client.ts',
      ],
      thresholds: {
        lines: 80,
      },
    },
    testTimeout: 1_200_000,
    hookTimeout: 1_200_000,
  },
})
