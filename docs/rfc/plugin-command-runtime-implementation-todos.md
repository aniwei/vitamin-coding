# Vitamin 插件 Command Runtime 产品化实施方案

> 阶段：PCR（Plugin Command Runtime Productization）  
> 设计来源：[`docs/rfc/plugin-architecture-implementation-todos.md`](./plugin-architecture-implementation-todos.md) 的 PLUGIN-16 到 PLUGIN-21 剩余风险  
> 关联背景：[`docs/rfc/plugin-architecture-audit.md`](./plugin-architecture-audit.md)、[`docs/rfc/vitamin-vs-claude-code-min-granularity.md`](./vitamin-vs-claude-code-min-granularity.md)  
> 更新时间：2026-05-02

## 阶段摘要

上一阶段已经把插件 command 从“manifest 声明”推进到“CLI 交互式 prompt 型 slash command”：支持 command Markdown 正文、positional 参数 schema、required/type/choices/default 校验、显式确认闸、额外参数拒绝和 quote-aware 参数解析。

本阶段继续把插件 command 产品化到 runtime 层。目标不是直接兼容任意 Claude Code command runtime，也不是让插件绕过 Vitamin 的 trust/permission/hook 体系，而是把当前 prompt-only command 的参数、执行、权限和诊断边界做成稳定宿主协议：

1. 参数解析从 positional-only 升级为稳定 command invocation object。
2. 命名 flag、repeatable 参数和 typed coercion 在进入模型或模块前完成。
3. prompt command 与 module command 共享同一套解析、权限、诊断和测试入口。
4. module command 必须经过 trust gate、安全 module resolver 和 command permission guard。
5. Claude Code 兼容仍采用静态导入/适配层，只映射可证明安全的参数与正文语义。

## 状态

- 阶段状态：Not Started
- 总完成百分比：0%
- 最新测试状态：Not Run
- 最新测试命令：Not Run
- 最新测试结果：2026-05-02 Asia/Shanghai，本阶段刚创建实施账本，尚未修改 runtime 代码。
- 依赖项：`@vitamin/tools` plugin manifest / command registry / manager、`@vitamin/coding` InteractiveMode / AgentSession、`@vitamin/hooks` permission guard、`@vitamin/cli` interactive entry、Claude Code compat importer。
- 执行策略：先抽纯解析与 invocation contract，再接交互式 prompt command，最后引入受 trust/permission 管控的 module command runtime。

## 设计与验收链接

- 上一阶段账本：[`docs/rfc/plugin-architecture-implementation-todos.md`](./plugin-architecture-implementation-todos.md)
- 插件体系审计：[`docs/rfc/plugin-architecture-audit.md`](./plugin-architecture-audit.md)
- Claude Code 对比：[`docs/rfc/vitamin-vs-claude-code-min-granularity.md`](./vitamin-vs-claude-code-min-granularity.md)
- Command manifest：`packages/tools/src/plugin-manifest.ts`
- Command registry：`packages/tools/src/plugin-command-registry.ts`
- Claude Code importer：`packages/tools/src/claude-code-compat.ts`
- Interactive runtime：`packages/coding/src/modes/run-modes.ts`
- CLI interactive entry：`packages/cli/src/cli.ts`
- 现有测试：`packages/tools/tests/plugin-manifest.test.ts`、`packages/tools/tests/claude-code-compat.test.ts`、`packages/coding/tests/run-modes.test.ts`、`packages/cli/tests/cli.test.ts`

## 启动检查清单

- [x] 已读取上一阶段 PLUGIN-ARCH TODO 与剩余风险。
- [x] 已读取当前 `PluginCommandRegistry` 和 `InteractiveMode` 实现。
- [x] 已确认上一阶段工作区已提交：`5615ab1 feat: productize plugin command arguments`。
- [x] 已确认本阶段不回写 PLUGIN-ARCH 的完成百分比。
- [ ] 开始实现前，重新读取目标模块当前代码。
- [ ] 每个 TODO 开工前补充输入/输出接口、测试路径和验证方式。
- [ ] 每个 TODO 完成前记录测试命令、测试结果和剩余风险。
- [ ] 修改总完成百分比前，先用进度计算命令复核。

## 参考依据与需求方案设计备注

| 需求簇                 | 要解决的问题                                                                              | 期望结果                                                                                                                                   | 约束与边界                                                                                           | 方案选择                                                                                                           | 放弃方案                                                          | 验证方式                                                                               |
| ---------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Invocation object      | 当前运行链直接传 `string[]`，位置参数、flag、默认值和原始输入没有统一事实来源。           | 插件 command 执行前产出稳定 `PluginCommandInvocation`，包含 raw tokens、positional、named flags、coerced args、defaults、schema warnings。 | 不破坏无 schema command 的 freeform `$ARGUMENTS` 行为；普通非 slash prompt 不受影响。                | 在 `@vitamin/tools` 或 `@vitamin/coding` 抽纯解析模块，InteractiveMode 只消费解析结果。                            | 在 InteractiveMode 内继续堆校验函数，后续 module runtime 难复用。 | parser 单测、prompt command 回归、legacy freeform 测试。                               |
| 命名 flag              | 当前 `--flag value` 会被当作位置参数，无法表达 Claude Code 风格 command options。         | 支持 `--name value`、`--name=value`、boolean flag、短横线值、quoted value，并能进入 schema 校验。                                          | `--confirm-plugin` 是宿主确认 flag，不进入插件 schema；未知 flag 是否拒绝取决于 schema 是否声明。    | manifest argument 增加 `kind: positional/flag` 或 `flag` 字段，解析层先剥离宿主 flag，再匹配插件 flag。            | 直接把所有 `--x` 透传给模型，无法做权限和类型校验。               | unknown flag、missing flag value、boolean flag、confirm flag 隔离测试。                |
| Repeatable 参数        | 多文件、多标签、多工具选择无法用当前单值位置参数表达。                                    | schema 支持 repeatable 参数，运行时输出数组值，并在 prompt schema 中明确展示。                                                             | 默认值、choices、type coercion 必须对每个元素生效；repeatable positional 只能放在尾部或明确拒绝。    | `repeatable: true` 生成数组；flag repeatable 支持多次出现；positional repeatable 采用尾部吸收。                    | 允许任意位置 repeatable positional，解析歧义大。                  | 多次 flag、尾部文件列表、choices 数组校验测试。                                        |
| Typed coercion         | 当前 type 校验后仍把字符串送入 prompt/module，模块 runtime 还需要重复解析。               | 运行时产生 typed values：string、number、boolean、string array、number array、boolean array。                                              | Prompt command 仍需要可读字符串渲染；module command 使用 typed object。                              | 解析结果同时保留 `raw` 和 `value`，prompt renderer 使用 raw/format，module handler 使用 value。                    | 只在模块侧转换，prompt 和 module 行为容易分裂。                   | number/boolean coercion、非法值拒绝、prompt 渲染稳定测试。                             |
| Module command runtime | manifest 已有 `commands[].module` 风险来源，但当前不执行 command module。                 | 可信插件 command 可声明 module/exportName，宿主加载受控 handler，并通过 invocation object 调用。                                           | 必须经过 trust gate、安全 realpath resolver、loaded/unloaded lifecycle；handler 不直接拿裸 session。 | 定义 `PluginCommandHandler` 最小接口，输入为 invocation 与受限 host context，输出 system/response/prompt handoff。 | 直接 import 并传完整 App/session，权限面过大。                    | trusted/untrusted module command、resolver escape、handler success/error/unload 测试。 |
| Permission guard       | 现有 `--confirm-plugin` 是命令级确认，不等价于按 command capability 授权。                | command 可声明所需 permission，执行前产生 permission decision/audit；拒绝时不调用 prompt 或 module。                                       | 不替代工具级 permission hook；prompt command 也可要求 shell/network/filesystem 等能力确认。          | 接入现有 permission guard 或抽 command permission adapter；先覆盖 CLI interactive 路径。                           | 只依赖 trust，一旦 trusted 就无限制执行 command。                 | permission allow/deny/audit 测试、未授权不调用 handler 测试。                          |
| Diagnostics            | 用户无法区分 parse failed、permission denied、handler failed、prompt command 已交给模型。 | CLI/system message 与 diagnostics 暴露结构化状态，便于审计和插件调试。                                                                     | 不泄露 prompt 正文或 secret；错误信息包含 pluginId/command/stage。                                   | 为 invocation、permission、runtime result 定义诊断事件，CLI 先展示文本摘要。                                       | 只返回普通字符串，后续 Devtools/日志无法消费。                    | error snapshot、diagnostics redaction、CLI message 测试。                              |
| Claude Code compat     | Claude Code command 参数语义可能继续演进，Vitamin 不能直接假设运行时兼容。                | importer 尽量映射 argument frontmatter、argument-hint、正文和静态 options；无法映射的字段进入 migration warning。                          | 不直接运行 Claude Code runtime；不导入未确认安全的 hooks/bin/settings 行为。                         | 扩展 compat importer 的参数映射和 warning report，保持 Vitamin manifest 是唯一执行事实。                           | 静默丢弃 unsupported 字段，用户误以为完全兼容。                   | fixture 转换、unsupported warning、导入后执行路径测试。                                |

## TODO 表

| ID     | 状态        | 完成百分比 | 测试通过 | 文件/模块                                                                                                                                                                              | 功能介绍                                                                                                                | 完成时设计核对                                                                                                                                                                                                                                         |
| ------ | ----------- | ---------: | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| PCR-01 | Not Started |         0% | Not Run  | `packages/tools/src/plugin-command-invocation.ts`、`packages/tools/tests/plugin-command-invocation.test.ts`、`packages/coding/src/modes/run-modes.ts`                                  | 抽出插件 command invocation 解析对象，统一 raw tokens、positional 参数、宿主 flag、默认值、校验错误和 prompt 渲染输入。 | 设计待补：输入为 command manifest、slash tokens、host flags；输出为成功 invocation 或结构化 parse/validation error。测试需覆盖 legacy freeform、required/default/type/choices、quoted tokens 和 `--confirm-plugin` 不进入插件参数。                    |
| PCR-02 | Not Started |         0% | Not Run  | `packages/tools/src/plugin-manifest.ts`、`packages/tools/src/claude-code-compat.ts`、`packages/tools/tests/plugin-manifest.test.ts`、`packages/tools/tests/claude-code-compat.test.ts` | 为 command 参数 schema 增加命名 flag 声明，并从 Claude Code 兼容导入器映射可识别 options。                              | 设计待补：明确 `flag`、`alias`、`kind` 或等价字段；manifest 校验需拒绝重复 flag、宿主保留 flag 和非法 alias。测试需覆盖 `--name value`、`--name=value`、boolean flag、未知 flag 和 migration warning。                                                 |
| PCR-03 | Not Started |         0% | Not Run  | `packages/tools/src/plugin-manifest.ts`、`packages/tools/src/plugin-command-invocation.ts`、`packages/coding/tests/run-modes.test.ts`                                                  | 支持 repeatable 参数，覆盖多文件、多标签等数组型 command 输入。                                                         | 设计待补：repeatable flag 可多次出现；repeatable positional 只能尾部吸收；default/choices/type 对数组每项生效。测试需覆盖数组成功、非法数组元素、非尾部 repeatable schema 拒绝。                                                                       |
| PCR-04 | Not Started |         0% | Not Run  | `packages/tools/src/plugin-command-invocation.ts`、`packages/coding/src/modes/run-modes.ts`、`packages/coding/tests/run-modes.test.ts`                                                 | 实现 typed coercion object，prompt command 和 module command 共享同一解析事实。                                         | 设计待补：invocation 同时保留 raw string、display string 和 typed value；prompt renderer 不泄露复杂对象格式，module runtime 使用 typed object。测试需覆盖 string/number/boolean 与数组类型。                                                           |
| PCR-05 | Not Started |         0% | Not Run  | `packages/tools/src/plugin-manifest.ts`、`packages/tools/src/plugin-manager.ts`、`packages/tools/src/plugin-command-registry.ts`、`packages/tools/tests/plugin-manager.test.ts`        | 定义并加载受 trust gate 管控的 plugin command module handler。                                                          | 设计待补：handler 输入为 invocation 与受限 host context；输出为 prompt handoff、system message 或 response text；untrusted 插件不得 import module；unload 时注销 handler。测试需覆盖 trusted 加载、untrusted skipped、resolver escape、handler error。 |
| PCR-06 | Not Started |         0% | Not Run  | `packages/coding/src/modes/run-modes.ts`、`packages/hooks/src/core/permission/*`、`packages/coding/tests/run-modes.test.ts`、`packages/hooks/tests/permission.test.ts`                 | 为插件 command 执行接入 permission guard 和审计证据。                                                                   | 设计待补：command manifest 声明 permissions；InteractiveMode 在 prompt/module 执行前请求 decision；拒绝时不调用模型或 handler。测试需覆盖 allow、deny、audit、无权限声明兼容路径。                                                                     |
| PCR-07 | Not Started |         0% | Not Run  | `packages/coding/src/modes/run-modes.ts`、`packages/service/src/routes/*`、`packages/devtools/src/*`                                                                                   | 补齐 command parse、permission、runtime result 的诊断事件和 CLI/system message。                                        | 设计待补：诊断事件包含 pluginId、command、stage、status、redacted error，不包含 secret 或完整 prompt；先接 CLI 文本，后续可被 Devtools 消费。测试需覆盖错误消息、redaction、diagnostics snapshot。                                                     |
| PCR-08 | Not Started |         0% | Not Run  | `packages/tools/src/claude-code-compat.ts`、`packages/tools/tests/claude-code-compat.test.ts`、`docs/rfc/plugin-command-runtime-implementation-todos.md`                               | 扩展 Claude Code command 兼容矩阵，明确已映射、部分映射和 unsupported runtime 字段。                                    | 设计待补：importer 对无法安全映射的 hooks/bin/settings/runtime 字段输出 warning；文档记录 Vitamin 不直接运行 Claude Code command runtime。测试需覆盖 fixture report 和导入后可执行的 Vitamin 参数 schema。                                             |

## 阶段完成标准

- `PluginCommandInvocation` 成为 prompt command 与 module command 的唯一执行输入事实来源。
- 命名 flag、repeatable 参数、typed coercion、default、choices、required、unexpected input 均有单元测试和交互式回归测试。
- module command 只有 trusted 插件可加载，且路径 resolver、unload lifecycle 和 handler error 均可诊断。
- command permission guard 在执行前生效，拒绝路径不调用模型、不调用 handler。
- Claude Code importer 对可映射字段写入 Vitamin manifest，对不可映射字段输出 migration warning。
- 本阶段完成时必须执行目标测试、相关包 typecheck/build；跨模块行为稳定后执行 `pnpm prepublish:check`。

## 状态更新规则

- `状态` 只能使用 `Not Started`、`In Progress`、`Done`。
- `测试通过` 只能使用 `Pass`、`Fail`、`Not Run`。
- `完成百分比` 使用保守整数。
- 只有实现、测试和设计核对均满足时，单项才能标为 100%。
- 阶段总完成百分比按 TODO 行百分比算术平均并四舍五入计算；当前为 8 项全部 0%，总完成百分比为 0%。
- 修改任一 TODO 百分比前，必须先读取对应实现和测试，不得只基于计划调整。

进度计算命令：

```sh
TODO_FILE=docs/rfc/plugin-command-runtime-implementation-todos.md
awk -F'|' '
/^\| PCR-[0-9]+ / {
  gsub(/ /, "", $4);
  gsub(/%/, "", $4);
  sum += $4;
  count += 1
}
END {
  if (count == 0) {
    printf "count=0 sum=0 average=0.00 rounded=0\n"
  } else {
    printf "count=%d sum=%d average=%.2f rounded=%d\n", count, sum, sum / count, int(sum / count + 0.5)
  }
}' "$TODO_FILE"
```

## RFC-to-TODO 执行记录

- 2026-05-02 23:13 Asia/Shanghai：按 `rfc-to-todos/SKILL.md` 方法论新建 `PCR` 阶段实施账本。依据 PLUGIN-ARCH 的 PLUGIN-16 到 PLUGIN-21 剩余风险，拆出 8 个最小可验证 TODO，覆盖 invocation object、命名 flag、repeatable、typed coercion、module command runtime、permission guard、diagnostics 和 Claude Code compat matrix。本轮为方案与 TODO 生产，未修改 runtime 代码，测试未运行。
