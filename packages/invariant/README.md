# @vitamin/invariant

Invariant assertions and build-time stripping plugin.

## Installation

```bash
pnpm add @vitamin/invariant
```

## Runtime Usage

```ts
import { invariant } from '@vitamin/invariant'

invariant(user != null, 'user is required')
```

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
