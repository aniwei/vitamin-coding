import { describe, expect, it } from 'vitest'

import { createBash, isReadOnlyShellCommand } from '../src/shell/bash'

describe('bash readonly classifier', () => {
  it('#then allows conservative read-only shell commands', () => {
    expect(isReadOnlyShellCommand('git status --short')).toBe(true)
    expect(isReadOnlyShellCommand('rg "needle" src')).toBe(true)
    expect(isReadOnlyShellCommand('ls -la | grep package')).toBe(true)
  })

  it('#then rejects mutating or unknown shell commands', () => {
    expect(isReadOnlyShellCommand('rm -rf dist')).toBe(false)
    expect(isReadOnlyShellCommand('echo hi > file.txt')).toBe(false)
    expect(isReadOnlyShellCommand('git reset --hard HEAD')).toBe(false)
    expect(isReadOnlyShellCommand('custom-tool run')).toBe(false)
  })

  it('#then exposes command-level readonly and concurrency metadata on the tool', () => {
    const tool = createBash('/tmp')

    expect(typeof tool.readonly).toBe('function')
    expect(typeof tool.isReadOnly).toBe('function')
    expect(typeof tool.isConcurrencySafe).toBe('function')
    expect(tool.isReadOnly?.({ command: 'git status' })).toBe(true)
    expect(tool.isConcurrencySafe?.({ command: 'touch file.txt' })).toBe(false)
  })
})
