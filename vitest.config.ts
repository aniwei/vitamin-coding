import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

export default defineConfig({
  resolve: {
    alias: {
      '@vitamin/env': resolve(__dirname, 'packages/env/src/index.ts'),
      '@vitamin/invariant': resolve(__dirname, 'packages/invariant/src/index.ts'),
      '@vitamin/shared': resolve(__dirname, 'packages/shared/src/index.ts'),
      '@vitamin/dispatcher': resolve(__dirname, 'packages/dispatcher/src/index.ts'),
      '@vitamin/ai': resolve(__dirname, 'packages/ai/src/index.ts'),
      '@vitamin/config': resolve(__dirname, 'packages/config/src/index.ts'),
      '@vitamin/agent': resolve(__dirname, 'packages/agent/src/index.ts'),
      '@vitamin/tools': resolve(__dirname, 'packages/tools/src/index.ts'),
      '@vitamin/hooks': resolve(__dirname, 'packages/hooks/src/index.ts'),
      '@vitamin/session': resolve(__dirname, 'packages/session/src/index.ts'),
      '@vitamin/persistence': resolve(__dirname, 'packages/persistence/src/index.ts'),
      '@vitamin/memory': resolve(__dirname, 'packages/memory/src/index.ts'),
      '@vitamin/orchestrator': resolve(__dirname, 'packages/orchestrator/src/index.ts'),
      '@vitamin/plan': resolve(__dirname, 'packages/plan/src/index.ts'),
      '@vitamin/resources': resolve(__dirname, 'packages/resources/src/index.ts'),
      '@vitamin/coding': resolve(__dirname, 'packages/coding/src/index.ts'),
      '@vitamin/extension': resolve(__dirname, 'packages/extension/src/index.ts'),
      '@vitamin/mcp': resolve(__dirname, 'packages/mcp/src/index.ts'),
      '@vitamin/tui': resolve(__dirname, 'packages/tui/src/index.ts'),
      '@vitamin/coding-agent': resolve(__dirname, 'packages/coding-agent/src/index.ts'),
      '@vitamin/sdk': resolve(__dirname, 'packages/sdk/src/index.ts'),
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
