# @vitamin/persistence

## 模块定位

提供统一的快照式持久化抽象，支持内存、磁盘、远程三种后端。

## 核心功能

| 模块                | 功能                                  |
| ------------------- | ------------------------------------- |
| Snapshot<T>         | 带版本号和元信息的数据快照            |
| MemoryPersistence   | 内存后端（Map）                       |
| DiskPersistence     | 磁盘后端（原子写入 .tmp -> rename）   |
| RemotePersistence   | HTTP REST 后端（Bearer Token + ETag） |
| Codec<T,S>          | 编解码器抽象                          |
| createPersistence() | 工厂函数                              |

## 目录概览

```
src/
  types.ts               # 核心类型
  snapshot.ts             # Snapshot 工厂
  memory-persistence.ts   # 内存后端
  disk-persistence.ts     # 磁盘后端
  remote-persistence.ts   # 远程后端
  create-persistence.ts   # 工厂
  index.ts                # barrel 导出
tests/                    # 4 个测试文件
```

## 开发命令

```bash
pnpm --filter @vitamin/persistence build
pnpm --filter @vitamin/persistence typecheck
pnpm --filter @vitamin/persistence clean
```

## 关联包

`@vitamin/shared`、`@vitamin/invariant`
