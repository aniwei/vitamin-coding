import type {
  Edge as ReactFlowEdge,
  Node as ReactFlowNode
} from 'reactflow'

export enum CustomNodeType {
  CustomNode = 'custom',
  CustomEdge = 'custom',
  CustomIterationStartNode = 'custom-iteration-start',
  CustomLoopStartNode = 'custom-loop-start',
  CustomNoteNode = 'custom-note',
  CustomSimpleNode = 'custom-simple',
}

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
  _connectedSourceHandleIds?: string[]
  _connectedTargetHandleIds?: string[]
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

export type NoteNodeType = {
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

export type NoteThemeShape = {
  outer: string
  title: string
  background: string
  border: string
}

const noteThemes: Record<NoteTheme, NoteThemeShape> = {
  [NoteTheme.Blue]: {
    outer: 'border-util-colors-blue-blue-500',
    title: 'bg-util-colors-blue-blue-100',
    background: 'bg-util-colors-blue-blue-50',
    border: 'border-util-colors-blue-blue-300',
  },
  [NoteTheme.Cyan]: {
    outer: 'border-util-colors-cyan-cyan-500',
    title: 'bg-util-colors-cyan-cyan-100',
    background: 'bg-util-colors-cyan-cyan-50',
    border: 'border-util-colors-cyan-cyan-300',
  },
  [NoteTheme.Green]: {
    outer: 'border-util-colors-green-green-500',
    title: 'bg-util-colors-green-green-100',
    background: 'bg-util-colors-green-green-50',
    border: 'border-util-colors-green-green-300',
  },
  [NoteTheme.Yellow]: {
    outer: 'border-util-colors-yellow-yellow-500',
    title: 'bg-util-colors-yellow-yellow-100',
    background: 'bg-util-colors-yellow-yellow-50',
    border: 'border-util-colors-yellow-yellow-300',
  },
  [NoteTheme.Pink]: {
    outer: 'border-util-colors-pink-pink-500',
    title: 'bg-util-colors-pink-pink-100',
    background: 'bg-util-colors-pink-pink-50',
    border: 'border-util-colors-pink-pink-300',
  },
  [NoteTheme.Violet]: {
    outer: 'border-util-colors-violet-violet-500',
    title: 'bg-util-colors-violet-violet-100',
    background: 'bg-util-colors-violet-violet-100',
    border: 'border-util-colors-violet-violet-300',
  }
}

export const getNoteTheme = (themeName: NoteTheme): NoteThemeShape => {
  return noteThemes[themeName]
}