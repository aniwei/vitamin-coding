import { describe, expect, it } from 'vitest'
import { HookRegistry, createPatchReviewGateHook } from '../src'
import type {
  ToolExecuteAfterInput,
  ToolExecuteAfterOutput,
} from '../src'

function makeInput(overrides: Partial<ToolExecuteAfterInput> = {}): ToolExecuteAfterInput {
  return {
    toolName: 'write',
    toolCallId: 'tool-1',
    args: { path: 'src/app.ts', content: 'export const a = 1' },
    result: { content: [{ type: 'text', text: 'ok' }] },
    agentName: 'agent',
    sessionId: 'session-1',
    durationMs: 10,
    ...overrides,
  }
}

function makeOutput(): ToolExecuteAfterOutput {
  return {
    result: { content: [{ type: 'text', text: 'ok' }] },
    metadata: {},
  }
}

describe('patch-review-gate', () => {
  it('adds review metadata and warning for mutating tools', async () => {
    const registry = new HookRegistry()
    registry.register(createPatchReviewGateHook())
    const output = makeOutput()

    await registry.execute('tool.execute.after', makeInput(), output)

    expect(output.result.isError).toBeUndefined()
    expect(output.metadata.patchReview).toMatchObject({
      required: true,
      blocked: false,
      risk: 'medium',
      toolName: 'write',
      targets: ['src/app.ts'],
    })
    expect(output.result.content.at(-1)?.text).toContain('Patch review gate: review required')
  })

  it('blocks high-risk targets by default', async () => {
    const registry = new HookRegistry()
    registry.register(createPatchReviewGateHook())
    const output = makeOutput()

    await registry.execute(
      'tool.execute.after',
      makeInput({ args: { path: 'package.json', content: '{}' } }),
      output,
    )

    expect(output.result.isError).toBe(true)
    expect(output.metadata.patchReview).toMatchObject({
      blocked: true,
      risk: 'high',
      targets: ['package.json'],
    })
    expect(output.result.details?.patchReview).toMatchObject({ blocked: true })
  })

  it('blocks dangerous shell commands', async () => {
    const registry = new HookRegistry()
    registry.register(createPatchReviewGateHook())
    const output = makeOutput()

    await registry.execute(
      'tool.execute.after',
      makeInput({
        toolName: 'bash',
        args: { command: 'rm -rf dist' },
      }),
      output,
    )

    expect(output.result.isError).toBe(true)
    expect(output.metadata.patchReview).toMatchObject({
      blocked: true,
      risk: 'high',
      toolName: 'bash',
    })
  })

  it('does not alter readonly tools or failed tool results', async () => {
    const registry = new HookRegistry()
    registry.register(createPatchReviewGateHook())
    const readOutput = makeOutput()
    const failedOutput: ToolExecuteAfterOutput = {
      result: { content: [{ type: 'text', text: 'failed' }], isError: true },
      metadata: {},
    }

    await registry.execute('tool.execute.after', makeInput({ toolName: 'read' }), readOutput)
    await registry.execute('tool.execute.after', makeInput(), failedOutput)

    expect(readOutput.metadata.patchReview).toBeUndefined()
    expect(readOutput.result.content).toHaveLength(1)
    expect(failedOutput.metadata.patchReview).toBeUndefined()
    expect(failedOutput.result.content).toHaveLength(1)
  })

  it('is registered in the default hook preset', () => {
    const registry = new HookRegistry({ preset: 'default' })

    expect(registry.has('patch-review-gate')).toBe(true)
  })
})
