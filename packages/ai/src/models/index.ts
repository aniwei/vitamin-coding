// 模型定义集合入口
// Phase 3: 未来此文件将引用自动生成的模型清单 (models.generated.ts)
// 当前直接复用 model-registry.ts 中的 COPILOT_MODELS 静态定义
//
// 演进路线:
//   Phase 2 (当前): 手动维护的最小模型集（COPILOT_MODELS）
//   Phase 3 (未来): 引入 scripts/generate-models.ts 从上游 API 或元数据文件生成 models.generated.ts
//                    此文件将变为 re-export: export { ALL_MODELS } from './models.generated'
//
// 生成脚本约定:
//   - 输入: 各 Provider 的模型元数据 (JSON/API)
//   - 输出: src/models/models.generated.ts — 纯数据文件，导出 Model[] 常量
//   - 触发: pnpm --filter @x-mars/ai generate:models
//   - 校验: 生成后自动 typecheck，确保符合 Model 接口

export { createDefaultModelRegistry } from '../model-registry'
