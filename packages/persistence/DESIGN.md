# @vitamin/persistence Design

## 1. Purpose

`@vitamin/persistence` provides a unified persistence contract for snapshot-style data.
It decouples storage backend choice from caller logic by exposing one common interface:

- `save(snapshot)`
- `load(id)`
- `delete(id)`
- `list()`
- `listPaginated(options)`

The module currently supports three backend families:

- In-memory (`MemoryPersistence`)
- Local filesystem (`FilePersistence`, via `DiskPersistence`)
- Remote HTTP service (`HttpPersistence`, via `RemotePersistence`)


## 2. Design Goals

- Keep caller-facing API backend-agnostic.
- Make backends composable and easy to extend through abstract base classes.
- Support pluggable serialization (`Codec`) without changing persistence logic.
- Provide predictable semantics for missing data (`null` / `false`) and transport errors.
- Keep implementation simple, portable, and testable.


## 3. Core Data Model

The package centers around `Snapshot<T>`:

```ts
interface Snapshot<T = unknown> {
  version: number
  id: string
  data: T
  metadata: Metadata
}

interface Metadata {
  createdAt: number
  updatedAt: number
  tags: string[]
  [key: string]: unknown
}
```

Pagination model:

```ts
interface PaginationOptions {
  page: number
  pageSize?: number
  sortBy?: 'createdAt' | 'updatedAt'
  order?: 'asc' | 'desc'
}

interface PaginatedResult<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
  hasNext: boolean
  hasPrevious: boolean
}
```


## 4. Architecture

Layered structure:

1. Contracts (`types.ts`)
- `Persistence<T>` interface
- Snapshot and pagination types
- `Codec<T>` abstraction
- Discriminated union `StorageOptions<T>` for factory input

2. Abstract backend implementations
- `DiskPersistence<S>`
- `RemotePersistence<S>`

3. Snapshot adapters
- `FilePersistence<T>` extends `DiskPersistence<Snapshot<T>>`
- `HttpPersistence<T>` extends `RemotePersistence<Snapshot<T>>`

4. Concrete in-memory implementation
- `MemoryPersistence<T>` directly implements `Persistence<T>`

5. Factory
- `createPersistence(options)` chooses backend by `options.type`


## 5. Codec Abstraction

`Codec<T>` controls serialization and media type:

```ts
interface Codec<T = unknown> {
  encode(snapshot: T): string
  decode(payload: string): T
  contentType?: string
}
```

Default codec in disk/remote base classes is JSON:

- `encode`: `JSON.stringify`
- `decode`: `JSON.parse`
- `contentType`: `application/json`

Why it exists:

- Allows wire/storage format evolution without rewriting persistence internals.
- Enables non-JSON payloads for HTTP and file backends.


## 6. Backend Behavior

### 6.1 MemoryPersistence

- Uses `Map<string, Snapshot<T>>` as store.
- Uses `structuredClone` on save/load to prevent reference sharing.
- Sorting for `listPaginated` is based on snapshot metadata (`createdAt` or `updatedAt`).
- Default page size: `20`.

### 6.2 DiskPersistence and FilePersistence

`FilePersistence` is a thin adapter; `DiskPersistence` holds the implementation.

Key behavior:

- Files are written atomically: write to `*.tmp` then `rename`.
- IDs are filename-safe via `encodeURIComponent` and decoded on list/load.
- Default extension: `.json`.
- Base directory is lazily created once (`mkdir -p` style).
- `load(id)`:
  - returns `null` on `ENOENT`
  - throws `PersistenceError` for other read/decode issues
- `delete(id)` returns `false` if remove fails.
- `list()` filters by extension and returns decoded IDs.
- `listPaginated()` sorts by file `mtimeMs` (not snapshot metadata payload).

### 6.3 RemotePersistence and HttpPersistence

`HttpPersistence` is a thin adapter; `RemotePersistence` holds HTTP mechanics.

Request behavior:

- Base URL trailing `/` is normalized away.
- Authorization header is generated from `getAuth()` token:
  - `Authorization: Bearer <token>` when token is non-empty
- Optional custom headers merged from `getHeaders()`.
- `Accept: application/json` always set.
- `Content-Type` set only when body exists:
  - codec `contentType` if provided
  - otherwise `application/json`
- Timeout enforced with `AbortController` (`timeoutMs`).

Response behavior:

- Non-OK and non-404 responses throw `RemotePersistenceError`.
- `load(id)` returns `null` on `404`.
- `delete(id)` returns `response.ok`.
- `list()` expects JSON payload `{ ids: string[] }`.
- `listPaginated()` expects JSON payload `PaginatedResult<string>`.


## 7. Factory Design

`createPersistence<T>(options: StorageOptions<T>)` is the single construction entry.

Supported `type` values:

- `memory`
- `file`
- `http`

Mapping:

- `memory` -> `new MemoryPersistence<T>()`
- `file` -> `new FilePersistence<T>({...})`
- `http` -> `new HttpPersistence<T>({...})`

Notes:

- For HTTP via factory, `timeoutMs` defaults to `30000` when omitted.
- Unknown `type` throws `Error("Unsupported storage type: ...")`.


## 8. Error Model

Two exported error classes:

- `PersistenceError`
  - generic local persistence failure (disk load/decode, etc.)
- `RemotePersistenceError extends PersistenceError`
  - includes `statusCode` for non-404 HTTP failure

Semantics:

- Missing object reads are not exceptional:
  - `load(id)` -> `null`
- Missing object deletes are not exceptional:
  - `delete(id)` -> `false`


## 9. HTTP API Contract (Expected by HttpPersistence)

Given base URL `<baseUrl>`:

- `PUT /{id}`
  - request body: encoded snapshot string
  - `Content-Type`: codec media type or JSON

- `GET /{id}`
  - `200`: encoded snapshot payload
  - `404`: not found (client returns `null`)

- `DELETE /{id}`
  - `2xx`: returns `true`
  - `404`: returns `false`

- `GET /`
  - response JSON: `{ "ids": string[] }`

- `GET /?page=&pageSize=&sortBy=&order=`
  - response JSON: `PaginatedResult<string>`


## 10. Testing Coverage Summary

Current tests verify:

- In-memory CRUD, deep clone semantics, sorting, pagination.
- Disk atomic write behavior, extension handling, codec override, ID sanitization, directory auto-create.
- Remote request method/path/body/header correctness, auth/header merge, codec media type override, error mapping, pagination query generation.
- Factory backend selection and option forwarding.


## 11. Constraints and Known Trade-offs

- `DiskPersistence.listPaginated()` sorts by file mtime, not snapshot metadata fields.
- No optimistic locking or version conflict check in any backend.
- Remote backend assumes server contract shape exactly as described above.
- Concurrency control is backend-dependent and intentionally minimal in this package.


## 12. Extension Points

- New persistence backend can be added by implementing `Persistence<T>` directly.
- For key/value-backed backends with shared mechanics, use abstract base-class style like current disk/remote design.
- Custom wire/storage formats can be introduced via `Codec` without changing caller code.
