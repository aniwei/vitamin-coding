# @vitamin/invariant

Invariant assertions, verbosity-controlled console, and build-time stripping plugin.

## Installation

```bash
pnpm add @vitamin/invariant
```

## Runtime Usage

```ts
import { invariant } from '@vitamin/invariant'

invariant(user != null, 'user is required')

// Function callback support
invariant(() => count > 0, 'count must be positive')
```

## Console Override API

```ts
import { invariant, setVerbosity } from '@vitamin/invariant'

const prev = setVerbosity('warn')
invariant.debug('this will not print')  // below 'warn' level
invariant.warn('this will print')
invariant.error('this will also print')
setVerbosity(prev)  // restore
```

Verbosity levels: `'debug'` | `'log'` | `'warn'` | `'error'` | `'silent'`

## API

| Export | Description |
|--------|-------------|
| `invariant(condition, message?)` | Runtime assertion, throws `InvariantError` on failure |
| `InvariantError` | Custom error class (`name: 'Invariant Violation'`, `framesToPop: 1`) |
| `setVerbosity(level)` | Set console output level, returns previous level |
| `invariant.debug/log/warn/error` | Conditional console output controlled by verbosity |
| `createStripInvariantInProductionPlugin(options)` | Build plugin for AST-based stripping |

## Types

| Type | Description |
|------|-------------|
| `VerbosityLevel` | `'debug' \| 'log' \| 'warn' \| 'error' \| 'silent'` |
| `ConsoleFunctionName` | `Exclude<VerbosityLevel, 'silent'>` |

## Build Plugin (AST)

```ts
import { createStripInvariantInProductionPlugin } from '@vitamin/invariant'

const isProduction = process.env.NODE_ENV === 'production'

export default defineConfig({
  esbuildPlugins: isProduction
    ? [createStripInvariantInProductionPlugin({ filter: /\/src\/agent\.ts$/ })]
    : [],
})
```

The plugin removes `invariant` import and `if (process.env.NODE_ENV !== 'production') { ...invariant(...)... }` blocks using TypeScript AST.

Behavior details:
- If the development guard contains an `invariant` call, the whole `if` branch is removed.
- If an `else` branch exists, the `else` branch is preserved.
- Development guards without `invariant` calls are left unchanged.
