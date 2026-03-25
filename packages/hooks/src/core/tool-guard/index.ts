// 工具守卫 Hook 集合导出
export { createFileGuardHook } from './file-guard'
export { createLabelTruncatorHook } from './label-truncator'
export { createRulesInjectorHook } from './rules-injector'
export { createOutputTruncationHook } from './output-truncation'
export { createToolErrorTrackerHook, getToolErrors, clearToolErrors } from './tool-error-tracker'
export type { ToolErrorTrackerConfig } from './tool-error-tracker'
