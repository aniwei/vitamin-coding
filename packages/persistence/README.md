# @vitamin/persistence

Unified snapshot persistence for memory, local files, and HTTP services.

This README is focused on integration and usage.
For implementation details, see `DESIGN.md`.


## Installation

In this monorepo, use workspace dependency:

```json
{
  "dependencies": {
    "@vitamin/persistence": "workspace:*"
  }
}
```


## Quick Start

```ts
import { createPersistence, type Snapshot } from '@vitamin/persistence'

type SessionState = {
  step: string
  tokens: number
}

const persistence = createPersistence<SessionState>({
  type: 'file',
  baseDir: '.vitamin/snapshots',
})

const snapshot: Snapshot<SessionState> = {
  version: 1,
  id: 'session-001',
  data: { step: 'planning', tokens: 120 },
  metadata: {
    createdAt: Date.now(),
    updatedAt: Date.now(),
    tags: ['session', 'draft'],
  },
}

await persistence.save(snapshot)
const loaded = await persistence.load('session-001')
const ids = await persistence.list()
const page0 = await persistence.listPaginated({ page: 0, pageSize: 20 })
await persistence.delete('session-001')
```


## Backend Selection

Use `createPersistence()` with one of these `type` values:

- `memory`
- `file`
- `http`

### Memory backend

```ts
import { createPersistence } from '@vitamin/persistence'

const persistence = createPersistence<MyData>({ type: 'memory' })
```

Good for tests, ephemeral state, and zero I/O scenarios.

### File backend

```ts
import { createPersistence } from '@vitamin/persistence'

const persistence = createPersistence<MyData>({
  type: 'file',
  baseDir: '.vitamin/snapshots',
  extension: '.json',
})
```

Notes:

- Atomic write is used internally (`tmp` file then rename).
- IDs are safely encoded into filenames.
- Missing item load returns `null`.

### HTTP backend

```ts
import { createPersistence } from '@vitamin/persistence'

const persistence = createPersistence<MyData>({
  type: 'http',
  baseUrl: 'https://api.example.com/snapshots',
  getAuth: async () => ({ token: process.env.API_TOKEN ?? '' }),
  getHeaders: async () => ({ 'X-Client': 'vitamin-app' }),
  fetch: globalThis.fetch,
  timeoutMs: 30_000,
})
```

Notes:

- Adds `Authorization: Bearer <token>` when token exists.
- Adds `Accept: application/json` by default.
- Throws `RemotePersistenceError` for non-404 HTTP errors.
- `load(id)` returns `null` for 404.


## Custom Codec

Use a custom `codec` to control serialization format and `Content-Type`.

```ts
import { createPersistence, type Snapshot } from '@vitamin/persistence'

const codec = {
  encode(snapshot: Snapshot<MyData>) {
    return `CUSTOM:${JSON.stringify(snapshot)}`
  },
  decode(payload: string): Snapshot<MyData> {
    return JSON.parse(payload.replace(/^CUSTOM:/, '')) as Snapshot<MyData>
  },
  contentType: 'text/plain',
}

const filePersistence = createPersistence<MyData>({
  type: 'file',
  baseDir: '.vitamin/custom',
  extension: '.snap',
  codec,
})

const httpPersistence = createPersistence<MyData>({
  type: 'http',
  baseUrl: 'https://api.example.com/snapshots',
  getAuth: async () => ({ token: 'token' }),
  fetch: globalThis.fetch,
  codec,
})
```


## Expected HTTP API Contract

For base URL `<baseUrl>`:

- `PUT /{id}`: save snapshot payload
- `GET /{id}`: return encoded snapshot payload, or 404 when absent
- `DELETE /{id}`: remove snapshot
- `GET /`: return `{ "ids": string[] }`
- `GET /?page=&pageSize=&sortBy=&order=`: return paginated ID result


## API Surface

Main exports include:

- `createPersistence`
- `MemoryPersistence`
- `FilePersistence`
- `HttpPersistence`
- `DiskPersistence` (abstract)
- `RemotePersistence` (abstract)
- `PersistenceError`
- `RemotePersistenceError`
- types: `Snapshot`, `Metadata`, `Persistence`, `Codec`, `StorageOptions`, pagination types


## Error Handling Pattern

```ts
import { RemotePersistenceError } from '@vitamin/persistence'

try {
  await persistence.save(snapshot)
} catch (error) {
  if (error instanceof RemotePersistenceError) {
    console.error('Remote call failed:', error.statusCode)
  } else {
    console.error('Persistence failed:', error)
  }
}
```
