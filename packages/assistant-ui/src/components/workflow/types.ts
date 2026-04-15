import type {
  Edge as ReactFlowEdge,
  Node as ReactFlowNode
} from 'reactflow'

export enum ControlMode {
  Pointer = 'pointer',
  Hand = 'hand',
}

export enum WorkflowRunningStatus {
  Waiting = 'waiting',
  Running = 'running',
  Succeeded = 'succeeded',
  Failed = 'failed',
  Stopped = 'stopped',
  Paused = 'paused',
}

export enum WorkflowVersion {
  Draft = 'draft',
  Latest = 'latest',
}

export interface CommonNode<T = {}> {
  isInIteration?: boolean
  iteration_id?: string
  selected?: boolean
  title: string
  desc: string
  type: BlockEnum
  width?: number
  height?: number
  // position?: XYPosition
  isInLoop?: boolean
  loop_id?: string
  error_strategy?: ErrorHandleTypeEnum
  // retry_config?: WorkflowRetryConfig
  // default_value?: DefaultValueForm[]
  credential_id?: string
  subscription_id?: string
  provider_id?: string
}

export interface CommonEdge {
  isInIteration?: boolean
  iteration_id?: string
  isInLoop?: boolean
  loop_id?: string
  sourceType: BlockEnum
  targetType: BlockEnum
}

export type Node<T = {}> = ReactFlowNode<CommonNode<T>>
export type Edge = ReactFlowEdge<CommonEdge>

export enum NoteTheme {
  Blue = 'blue',
  Cyan = 'cyan',
  Green = 'green',
  Yellow = 'yellow',
  Pink = 'pink',
  Violet = 'violet',
}

export enum ErrorHandleTypeEnum {
  None = 'none',
  FailBranch = 'fail-branch',
  DefaultValue = 'default-value',
}

export enum NodeRunningStatus {
  NotStart = 'not-start',
  Waiting = 'waiting',
  Listening = 'listening',
  Running = 'running',
  Succeeded = 'succeeded',
  Failed = 'failed',
  Exception = 'exception',
  Retry = 'retry',
  Stopped = 'stopped',
  Paused = 'paused',
}

export enum BlockEnum {
  Start = 'start',
  End = 'end',
  Answer = 'answer',
  LLM = 'llm',
  KnowledgeRetrieval = 'knowledge-retrieval',
  QuestionClassifier = 'question-classifier',
  IfElse = 'if-else',
  Code = 'code',
  TemplateTransform = 'template-transform',
  HttpRequest = 'http-request',
  VariableAssigner = 'variable-assigner',
  VariableAggregator = 'variable-aggregator',
  Tool = 'tool',
  ParameterExtractor = 'parameter-extractor',
  Iteration = 'iteration',
  DocExtractor = 'document-extractor',
  ListFilter = 'list-operator',
  IterationStart = 'iteration-start',
  Assigner = 'assigner', // is now named as VariableAssigner
  Agent = 'agent',
  Loop = 'loop',
  LoopStart = 'loop-start',
  LoopEnd = 'loop-end',
  HumanInput = 'human-input',
  DataSource = 'datasource',
  DataSourceEmpty = 'datasource-empty',
  KnowledgeBase = 'knowledge-index',
  TriggerSchedule = 'trigger-schedule',
  TriggerWebhook = 'trigger-webhook',
  TriggerPlugin = 'trigger-plugin',
}

export interface NoteNodeType  {
  text: string
  theme: NoteTheme
  author: string
  showAuthor: boolean
  selected?: boolean
  width?: number
  height?: number
}

export type ModelSetting = {
  provider: string
  name: string
  mode: string
  completion_params: Record<string, any>
}
