/**
 * coding/src/hooks/index.ts
 *
 * 导出所有 coding 层的业务 hook 工厂函数。
 * 这些 hooks 依赖具体的业务状态（toolRegistry、learningStore 等），
 * 与 @vitamin/hooks 中的通用基础设施 hooks 分开管理。
 */

export { createToolGuidanceHook } from './tool-guidance'
export { createEnvironmentInjectionHook } from './environment-injection'
export { createLessonInjectionHook } from './lesson-injection'
export { createPhaseTrackingHooks } from './phase-tracking'
export { createSessionLearningHooks } from './session-learning'
