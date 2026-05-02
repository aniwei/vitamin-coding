# X-Mars 插件体系设计审计

> 审计日期：2026-05-02  
> 审计范围：`@x-mars/tools` plugin manifest / manager、`XMarsApp` 生命周期接入、CLI plugin 命令、相关测试与 VCCG 插件 TODO 记录。
> 审计目标：确认当前插件体系是否形成产品级闭环，并识别后续可推进的最小设计债。

## 结论摘要

本审计最初识别的插件体系产品化缺口已经迁移到 [`docs/rfc/plugin-architecture-implementation-todos.md`](./plugin-architecture-implementation-todos.md)，并在 `PLUGIN-ARCH` 阶段完成。

当前状态：

1. 动态代码加载已收紧到显式 trust gate，含动态 `module`、MCP、Devtools contribution、Log contribution 的插件未 trust 时只进入 discovery/diagnostics。
2. trusted/disabled 状态已通过 `PluginStateStore` 持久化，并由 CLI/App 共用。
3. `tools/skills/MCP/hooks/commands/agents/devtools/logs` 已纳入统一 capability lifecycle diagnostics；无 adapter 的能力不再误报 loaded。
4. module resolver 已使用 `realpath()` 防 symlink escape，并支持 root 本身作为插件目录。
5. Claude Code 兼容采用静态导入/转换层，不直接运行 Claude Code runtime。
6. Devtools host、Logger core、PermissionAuditLog 保持宿主管理，插件只贡献受 trust/redaction/permission 边界约束的扩展点。

本文件保留原始审计发现作为设计背景；实施事实以 `PLUGIN-ARCH` 实施账本和对应测试结果为准。

## 证据范围

| 领域            | 文件/模块                                                                                                                                                 | 审计发现                                                                                                           |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Manifest schema | `packages/tools/src/plugin-manifest.ts`                                                                                                                   | 支持 `tools/skills/mcpServers/hooks/commands/agents/permissions`，并能输出 summary/runtime plan/lifecycle result。 |
| Runtime manager | `packages/tools/src/plugin-manager.ts`                                                                                                                    | 扫描 plugin roots，真实加载 tools/hooks，维护内存态 trusted/disabled/loaded。                                      |
| App 生命周期    | `packages/coding/src/app/x-mars-app.ts`                                                                                                                   | `pluginRoots` 存在时构造 manager，`start()` 调 `loadAll()`，`stop()` 调 `unloadAll()`。                            |
| CLI             | `packages/cli/src/cli.ts`                                                                                                                                 | 默认扫描 `.x-mars/plugins`，支持 `list/enable/disable/reload`，但状态不持久。                                      |
| 测试            | `packages/tools/tests/plugin-manifest.test.ts`、`packages/tools/tests/plugin-manager.test.ts`、`packages/coding/tests/plugin-manager-integration.test.ts` | 覆盖 manifest、坏 JSON、越界路径、危险权限未信任阻断、hook 加载/卸载、App start/stop。                             |
| 设计账本        | `docs/rfc/x-mars-vs-claude-code-implementation-todos.md`                                                                                                  | VCCG-08/VCCG-09 标记 Done，并已记录 trust 内存态、commands/agents 仅声明的剩余风险。                               |

## 当前架构流程

```text
CLI / createXMars(options.pluginRoots)
  -> XMarsApp.constructor()
  -> createPluginManager({ roots, toolRegistry })
  -> XMarsApp.start()
  -> PluginManager.loadAll()
  -> discoverPluginManifests(roots)
  -> validatePluginManifest()
  -> buildPluginRuntimePlan()
  -> requiresTrust()
  -> importPluginTool() / importPluginHook()
  -> ToolRegistry.register() / HookRegistry.register()
  -> PluginManagerDiagnostics
```

禁用流程：

```text
PluginManager.disable(pluginId)
  -> disabled.add(pluginId)
  -> unregister plugin-owned tools
  -> unregister loaded hook names
  -> loaded.delete(pluginId)
```

卸载流程：

```text
XMarsApp.stop()
  -> PluginManager.unloadAll()
  -> unregister plugin-owned tools/hooks
  -> loaded.clear()
```

## 能力矩阵

| 能力           | Manifest 支持         | Runtime plan 支持 | PluginManager 真实加载                   | CLI 管理                | 审计判断                                                                                           |
| -------------- | --------------------- | ----------------- | ---------------------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------- |
| Tool           | Yes                   | Yes               | Yes，动态 import 并注册到 `ToolRegistry` | 间接支持 reload/disable | 基础可用，但 trust 边界需收紧。                                                                    |
| Hook           | Yes                   | 仅 skipped step   | Yes，动态 import 并注册到 `HookRegistry` | 间接支持 reload/disable | 可用，但 `XMarsApp` 当前未把 `hookRegistry` 传给 `PluginManager`，默认 App 路径实际不会加载 hook。 |
| Skill          | Yes                   | Yes               | No                                       | No                      | 仍是声明/adapter 设计，没有接入 `SkillProvider`。                                                  |
| MCP server     | Yes                   | Yes               | No                                       | No                      | 仍是声明/adapter 设计，没有接入 `McpManager` connect/disconnect。                                  |
| Command        | Yes                   | 仅 skipped step   | No，当前直接标记 loaded                  | No                      | 诊断语义容易误导，应改成 skipped/pending 或接入命令注册器。                                        |
| Agent          | Yes                   | 仅 skipped step   | No，当前直接标记 loaded                  | No                      | 诊断语义容易误导，应接入 agent profile/registry。                                                  |
| Trust          | Yes，permissions 字段 | 间接              | 内存态 gate                              | No persistent trust     | 只能阻断部分危险声明，不能作为产品级安全模型。                                                     |
| Enable/disable | Yes，status 字段      | Yes               | 内存态 disabled set                      | No persistence          | CLI 操作跨进程失效。                                                                               |

## 主要发现

### P0：`tools` 插件未信任即可动态 import

位置：`packages/tools/src/plugin-manager.ts:159`、`packages/tools/src/plugin-manager.ts:269`、`packages/tools/src/plugin-manager.ts:351`

`requiresTrust()` 会删除 `tools` 权限，只要插件没有 `shell/network/filesystem/mcp/skills`、hook、MCP server，就不要求 trust。随后 `importPluginTool()` 会直接 `import(pathToFileURL(modulePath).href)`。JS module import 会执行模块顶层代码，因此“tools-only 不危险”的假设不成立。

影响：任意本地插件只声明 tool 即可在 App 启动时执行代码，绕过 trust 预期。即使 tool execute 后续受权限 guard 限制，模块顶层副作用已经发生。

建议：把“动态代码加载”本身定义为危险能力。第一阶段可要求所有含 `module` 的插件必须 trusted；第二阶段再设计可声明但不执行的纯 manifest 插件能力。

### P1：CLI enable/disable 不持久，且 plugin 子命令前已自动加载

位置：`packages/cli/src/cli.ts:219`、`packages/cli/src/cli.ts:222`、`packages/cli/src/cli.ts:307`

CLI 每次创建新的 `XMarsApp`，`app.start()` 会先加载 `.x-mars/plugins`，然后 `runPluginCommand()` 才执行 `enable/disable/reload`。`manager.enable/disable` 只改内存 Set，进程退出即丢失。

影响：`x-mars plugin disable <id>` 对下一次启动无效；`enable` 也不会写入 manifest 或 settings。用户会误以为插件状态已被管理。

建议：新增 `PluginStateStore`，将 trusted/disabled/version/source 写入 `.x-mars/plugins.json` 或 settings。CLI plugin 命令应先读取 store，再决定是否加载插件；`list` 应展示 discovered、loaded、trusted、disabled、errors。

### P1：`XMarsApp` 未传入 `hookRegistry`，App 默认路径加载不了 hook

位置：`packages/coding/src/app/x-mars-app.ts:291`、`packages/tools/src/plugin-manager.ts:20`、`packages/tools/src/plugin-manager.ts:233`

`PluginManagerOptions` 支持 `hookRegistry`，测试中也通过显式传入 registry 验证 hook 加载。但 `XMarsApp` 构造 manager 时只传 `roots` 和 `toolRegistry`，所以真实 App 启动路径中 hook 会被标记 skipped。

影响：VCCG-09 文档中“可信插件可动态 import hook module 并注册到 HookRegistry”只对直接构造 `PluginManager` 成立，对默认 `XMarsApp.pluginRoots` 不成立。

建议：`XMarsApp` 构造 `createPluginManager({ roots, toolRegistry, hookRegistry: this.hookRegistry })`，并补 App 集成测试验证 plugin hook 在 session prompt/hook pipeline 中可见。

### P1：MCP/Skill manifest 与 runtime manager 脱节

位置：`packages/tools/src/plugin-manifest.ts:92`、`packages/tools/src/plugin-manifest.ts:121`、`packages/tools/src/plugin-manager.ts:177`

`PluginRuntimePlan` 和 `applyPluginRuntimePlan()` 支持 skills/MCP adapter，但 `PluginManager.loadDiscovered()` 没有调用 skill loader 或 MCP manager。`XMarsApp` 也没有把 `skillProvider`、`mcpManager` 注入 manager。

影响：插件可以声明 skill/MCP，但启动后不会真正可用；trust gate 会因 MCP/skills 声明阻断加载，却没有 trust 后的连接路径。

建议：把 `PluginManager` 改成统一 adapter 驱动，接入 `loadSkill/unloadSkill/connectMcpServer/disconnectMcpServer`。`XMarsApp` 负责把 `SkillProvider`、`McpManager` 适配成 lifecycle adapters。

### P1：commands/agents 标记 loaded 但没有注册或执行入口

位置：`packages/tools/src/plugin-manager.ts:185`

当前 `commands` 和 `agents` 只在 `loadDiscovered()` 中写入 `{ status: 'loaded' }` step，没有 command registry、slash command router、agent profile registry 或执行模块 import。

影响：diagnostics 会把未生效能力显示为 loaded，破坏审计可信度。

建议：短期改成 `skipped` 并写明 adapter 未配置；中期增加 `PluginCommandRegistry` 和 `PluginAgentRegistry`，只有注册成功后才标记 loaded。

### P2：插件路径限制没有 `realpath`，不能处理 symlink escape

位置：`packages/tools/src/plugin-manager.ts:263`、`packages/tools/src/plugin-manager.ts:342`

当前路径限制使用 `resolve(pluginDir, module)` 后检查 `startsWith(root + sep)`。如果 plugin root 内存在 symlink 指向外部目录，解析后的路径字符串仍可能位于 root 内，但实际文件在 root 外。

影响：本地插件可以通过 symlink 读取/执行 root 外模块，削弱“module must be inside plugin root”的安全声明。

建议：对 `pluginDir` 和 `modulePath` 都执行 `realpath()` 后比较；测试补充 symlink escape 负向用例。Windows 大小写和路径分隔符也应纳入路径工具测试。

### P2：发现模型只扫描 root 下一层目录

位置：`packages/tools/src/plugin-manifest.ts:245`

`discoverPluginManifests()` 只读取 `roots` 下的子目录，再查找子目录中的 `plugin.json` / `x-mars-plugin.json`。如果用户把某个插件目录本身作为 root，它不会被发现。

影响：CLI 默认 `.x-mars/plugins/<plugin>/plugin.json` 可用，但 programmatic API 的 root 语义不直观。

建议：支持 root 本身就是插件目录，同时保留 root 下多插件目录扫描；diagnostics 中区分 `pluginRoot` 与 `pluginDir`。

### P2：ToolRegistry 注册冲突允许同一 pluginId 覆盖

位置：`packages/tools/src/plugin-manager.ts:210`、`packages/tools/src/tool-registry.ts`

`loadTool()` 只阻止不同 pluginId 的同名 tool。如果同一 pluginId reload 或 manifest 内部重复之外的异常路径导致同名 tool 注册，`ToolRegistry.register()` 会覆盖 Map。

影响：正常 reload 可工作，但 diagnostics 无法区分覆盖、替换和首次注册；插件版本升级/热刷新时缺少明确事件。

建议：生命周期结果增加 `replaced` 或 `updated` step；`ToolRegistry.register()` 可选 strict mode，插件 manager 使用 strict mode 并显式 unload 后再 load。

## 可抽象到公共模块的点

| 可抽象点                     | 当前位置                                                            | 建议归属                                        | 原因                                                                                            |
| ---------------------------- | ------------------------------------------------------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Manifest 诊断结构            | `plugin-manifest.ts` 手写 errors/warnings                           | `@x-mars/manifest` 或 `@x-mars/schema`          | Skill/Memory 已复用 frontmatter parser，Plugin JSON 仍可复用通用 diagnostics 和 schema result。 |
| Capability lifecycle         | `applyPluginRuntimePlan()` 与 `PluginManager.loadDiscovered()` 分叉 | `@x-mars/plugin` 或 `@x-mars/runtime-lifecycle` | Tools/Skills/MCP/Hooks/Commands/Agents 都是 capability 生命周期，应该统一 step/result/adapter。 |
| Secure module resolver       | `importPluginTool()`、`importPluginHook()` 各自校验路径             | `@x-mars/shared` 或 `@x-mars/plugin`            | 动态 import、安全路径、realpath/symlink 检查会被插件 command/agent/skill loader 复用。          |
| Trust/permission state store | `PluginManager` 内存 Set                                            | `@x-mars/resources` 或 `@x-mars/plugin`         | trusted/disabled 是用户配置状态，应跟 settings/session/resource 生命周期统一。                  |
| Diagnostics presenter        | CLI 手写 list 输出                                                  | `@x-mars/plugin` + CLI/UI adapter               | plugin list、context diagnostics、service API 需要同一状态视图。                                |

## 建议实施 TODO

本节的原始建议已经转入 `PLUGIN-ARCH` 实施账本并完成。为避免与实施账本重复维护，这里只保留状态索引：

| ID        | 状态 | 实施账本                                                                                       |
| --------- | ---- | ---------------------------------------------------------------------------------------------- |
| PLUGIN-01 | Done | [`plugin-architecture-implementation-todos.md`](./plugin-architecture-implementation-todos.md) |
| PLUGIN-02 | Done | [`plugin-architecture-implementation-todos.md`](./plugin-architecture-implementation-todos.md) |
| PLUGIN-03 | Done | [`plugin-architecture-implementation-todos.md`](./plugin-architecture-implementation-todos.md) |
| PLUGIN-04 | Done | [`plugin-architecture-implementation-todos.md`](./plugin-architecture-implementation-todos.md) |
| PLUGIN-05 | Done | [`plugin-architecture-implementation-todos.md`](./plugin-architecture-implementation-todos.md) |
| PLUGIN-06 | Done | [`plugin-architecture-implementation-todos.md`](./plugin-architecture-implementation-todos.md) |
| PLUGIN-07 | Done | [`plugin-architecture-implementation-todos.md`](./plugin-architecture-implementation-todos.md) |
| PLUGIN-08 | Done | [`plugin-architecture-implementation-todos.md`](./plugin-architecture-implementation-todos.md) |
| PLUGIN-09 | Done | [`plugin-architecture-implementation-todos.md`](./plugin-architecture-implementation-todos.md) |

## RFC-to-TODO 执行记录

- 2026-05-02 Asia/Shanghai：按 `rfc-to-todos/SKILL.md` 的方案设计规则审计插件体系；读取 manifest、manager、App、CLI、测试和 VCCG TODO 证据；产出独立审计文档 `docs/rfc/plugin-architecture-audit.md`。本轮为设计审计，不修改 runtime 代码，测试未运行。
- 2026-05-02 21:36 Asia/Shanghai：同步审计文档状态。`PLUGIN-ARCH` 实施账本已完成 PLUGIN-01 到 PLUGIN-09，阶段状态 Done / 100%；本文件保留原始审计发现作为背景，实施事实改以 `docs/rfc/plugin-architecture-implementation-todos.md` 为准。本轮只更新文档一致性，未修改 runtime 代码，测试沿用实施账本最新验证记录。
