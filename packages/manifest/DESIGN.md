# @x-mars/manifest 设计说明

## 模块设计基线

### 设计目的

定义插件、资源或运行时清单相关的结构与校验入口，为插件体系和跨包元数据提供稳定边界。

### 接口设计

- `src/index.ts`：统一导出 manifest 类型、解析与校验能力。
- `package.json exports`：对外只暴露包根入口。

### 方法论

清单模块只描述声明式元数据，不承担加载副作用；消费方负责根据清单创建运行时对象。

### 实现逻辑

调用方读取清单文件后交给 manifest 模块解析和校验，得到标准结构，再交给 tools/coding/service 等模块消费。

### 流程逻辑图

```mermaid
flowchart TD
  A[manifest file/object] --> B[@x-mars/manifest parse]
  B --> C[validate schema]
  C --> D[normalized manifest]
  D --> E[plugin/resource runtime]
```
