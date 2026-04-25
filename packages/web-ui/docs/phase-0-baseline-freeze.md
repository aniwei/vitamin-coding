# Phase 0 Baseline Freeze

## 1. 目的

为 Web UI Next.js -> Vite 迁移建立基线冻结规则，避免双栈并行阶段出现变更漂移。

## 2. 冻结规则

- `packages/web-ui/src/**` 进入迁移冻结区：
  - 仅允许阻断级修复（P0/P1）。
  - 非阻断功能新增必须落到 `packages/web-ui/client/**` 或 `packages/web-ui/server/**`。
- 新增 API 禁止进入 `packages/web-ui/src/app/api/**`。
- 新增页面禁止进入 `packages/web-ui/src/app/**`。
- 禁止引入 Next 兼容 shim（如 useRouter 兼容层）。

## 3. 审批与例外

- 例外申请需在 PR 描述中注明：
  - 例外原因
  - 影响范围
  - 回补迁移计划
- 例外审批人：Web UI Migration Owner。

## 4. Owner 与里程碑

| 项目 | Owner | 截止日期 | 说明 |
| --- | --- | --- | --- |
| Phase 0 基线冻结 | aniwei | 2026-04-25 | 已完成建立 |
| Phase 1 骨架落地 | aniwei | 2026-04-27 | Router/Provider/I18n/API Client |
| Phase 2 页面迁移 | aniwei | 2026-04-30 | chat/mcp/workflow/auth/admin/export |
| Phase 3 API 迁移 | aniwei | 2026-05-03 | server routes + client api |
| Phase 4 模块迁移 | aniwei | 2026-05-06 | components/hooks/lib/store/types |
| Phase 5 切流下线 | aniwei | 2026-05-08 | legacy 清理与发布门禁 |

## 5. 基线盘点快照（2026-04-25）

- `src/app` 文件数：95
- `src/components` 文件数：229
- `src/hooks + src/lib + src/types` 文件数：206

该快照用于后续阶段核对迁移覆盖率与遗留清理进度。
