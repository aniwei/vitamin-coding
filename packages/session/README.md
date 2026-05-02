# @x-mars/session

## 模块定位

管理 Agent 会话的完整生命周期：创建、分支、压缩、分页、持久化、懒回收。

## 核心功能

| 模块                     | 功能                               |
| ------------------------ | ---------------------------------- |
| InMemorySession          | 链表式会话，支持分支 / 压缩 / 分页 |
| SessionStore             | 会话 CRUD 存储接口                 |
| SessionManager           | 会话容器，懒 GC + 容量控制         |
| FileSessionPersistence   | 文件持久化适配                     |
| HttpSessionPersistence   | HTTP 持久化适配                    |
| RemoteSessionPersistence | 远程持久化适配                     |

## 目录概览

```
src/
  types.ts                    # 核心接口
  session.ts                  # InMemorySession
  session-store.ts            # SessionStore
  session-manager.ts          # SessionManager
  persistence/
    file-session-persistence.ts
    http-session-persistence.ts
    remote-session-persistence.ts
  index.ts
tests/                        # 6 个测试文件
```

## 开发命令

```bash
pnpm --filter @x-mars/session build
pnpm --filter @x-mars/session typecheck
pnpm --filter @x-mars/session clean
```

## 关联包

`@x-mars/persistence`、`@x-mars/shared`、`@x-mars/env`、`@x-mars/invariant`
