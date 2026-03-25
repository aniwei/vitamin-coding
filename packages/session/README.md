# @vitamin/session

Session abstractions and an in-memory session store.

## Installation

```bash
pnpm add @vitamin/session
```

## Usage

```ts
import { createInMemorySessionStore } from '@vitamin/session'

const store = createInMemorySessionStore()
const session = store.createSession()

session.appendUserMessage('Hello')
session.appendAssistantMessage('Hi!')
```

## License

See [root README](../../README.md) for details.
