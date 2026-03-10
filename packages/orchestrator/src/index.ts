// @vitamin/orchestrator — 多 Agent 编排引擎

// 类型
export type {
  AgentMode,
  AgentCategory,
  AgentCost,
  AgentPromptMetadata,
  AgentFactory,
  AgentFactoryOptions,
  AgentInstance,
  AgentResult,
  AgentRegistration,
  TaskRequest,
  TaskStatus,
  TaskHandle,
  Dispatcher,
  PlanFamilyAgent,
} from './types'
export { PLAN_FAMILY, isPlanFamily } from './types'

// 注册表
export { AgentRegistry, createAgentRegistry } from './registry/agent-registry'
export { AGENT_MODEL_PRIORITY, AGENT_TOOL_RESTRICTIONS, AGENT_METADATA } from './registry/agent-metadata'

// 委派调度
export { CategoryResolver, createCategoryResolver } from './delegation/category-resolver'
export type { CategoryResolverOptions } from './delegation/category-resolver'
export { TaskDispatcher, createTaskDispatcher } from './delegation/task-dispatcher'
export type { TaskDispatcherOptions } from './delegation/task-dispatcher'
export { executeSyncTask } from './delegation/execution-modes'
export type { BackgroundExecutor } from './delegation/execution-modes'

// 后台管理
export { BackgroundManager, createBackgroundManager } from './background/background-manager'
export type { BackgroundManagerOptions } from './background/background-manager'

// Agent 工厂
export {
  wrapAgent,
  extractTextContent,
  createCentralSecretariatAgent,
  createHephaestusAgent,
  createExploreAgent,
  createOracleAgent,
  createLibrarianAgent,
  createSisyphusJuniorAgent,
  createMetisAgent,
  createMomusAgent,
  parseMomusOutput,
  createMultimodalLookerAgent,
  createPrometheusAgent,
  planToMarkdown,
  markdownToPlan,
  createInterviewState,
  extractInterviewQuestions,
  buildInterviewPrompt,
  createAtlasAgent,
  buildDag,
  getReadyNodes,
  markFailedAndCascade,
  getDagProgress,
  isDagFinished,
  collectDagResult,
  validateDagNoCycles,
} from './agents'
export type {
  MomusReviewResult,
  Plan,
  PlanStep,
  InterviewState,
  InterviewQuestion,
  DagNode,
  DagNodeStatus,
  DagExecutionResult,
} from './agents'

// Plan-Build 管线
export { createPlanStorage, executePlanPipeline, executePlan } from './plan-build'
export type {
  PlanStorage,
  PipelineState,
  PipelinePhase,
  PipelineResult,
  PipelineOptions,
  PlanExecutorOptions,
  PlanExecutionResult,
  ExecutionProgressEvent,
  ProgressCallback,
} from './plan-build'

// 动态 Prompt
export {
  buildDelegationTable,
  buildKeyTriggers,
  buildToolSelectionTable,
  buildDynamicPrompt,
} from './dynamic-prompt/prompt-builder'
export type { PromptBuilderInput } from './dynamic-prompt/prompt-builder'
export { buildAgentSummary, buildAllAgentSummaries } from './dynamic-prompt/agent-summaries'
