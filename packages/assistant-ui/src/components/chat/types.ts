import { Annotation } from '@/types'


export type ExtraContent
  = {
    type: 'human_input'
    submitted: false
    workflow_run_id: string
  }
  | {
    type: 'human_input'
    submitted: true
  }

export interface EnableType {
  enabled: boolean
}

export interface ToolInfoInThought {
  name: string
  label: string
  input: string
  output: string
  isFinished: boolean
}

export enum InputVarType {
  textInput = 'text-input',
  paragraph = 'paragraph',
  select = 'select',
  number = 'number',
  url = 'url',
  files = 'files',
  json = 'json', // obj, array
  jsonObject = 'json_object', // only object support define json schema
  contexts = 'contexts', // knowledge retrieval
  iterator = 'iterator', // iteration input
  singleFile = 'file',
  multiFiles = 'file-list',
  loop = 'loop', // loop input
  checkbox = 'checkbox',
}

export interface InputForm {
  type: InputVarType
  label: string
  variable: any
  required: boolean
  hide: boolean
  [key: string]: any
}

export interface ChatSetting extends Omit<ModelConfig, 'model'> {
  supportAnnotation?: boolean
  appId?: string
  questionEditEnable?: boolean
  supportFeedback?: boolean
  supportCitationHitInfo?: boolean
  system_parameters: {
    audio_file_size_limit: number
    file_size_limit: number
    image_file_size_limit: number
    video_file_size_limit: number
    workflow_file_upload_limit: number
  }
  more_like_this: {
    enabled: boolean
  }
}

export interface WorkflowProcess {
  expand?: boolean // for UI
  resultText?: string
}

export interface CitationItem {
  content: string
  data_source_type: string
  dataset_name: string
  dataset_id: string
  document_id: string
  document_name: string
  hit_count: number
  index_node_hash: string
  segment_id: string
  segment_position: number
  score: number
  word_count: number
}

export interface ThoughtItem {
  id: string
  tool: string // plugin or dataset. May has multi.
  thought: string
  tool_input: string
  tool_labels?: { [key: string]: string }
  message_id: string
  conversation_id: string
  observation: string
  position: number
}

export interface Feedback {
  rating: 'like' | 'dislike'
  content?: string | null
}

export interface MessageMore {
  time: string
  tokens: number
  latency: number | string
  tokens_per_second?: number | string
}

export interface ChatItem {
  id: string
  content: string
  citation?: CitationItem[]
  isAnswer: boolean
  feedback?: Feedback
  adminFeedback?: Feedback
  feedbackDisabled?: boolean
  more?: MessageMore
  annotation?: Annotation
  useCurrentUserAvatar?: boolean
  isOpeningStatement?: boolean
  suggestedQuestions?: string[]
  log?: { role: string, text: string, files?: FileEntity[] }[]
  agent_thoughts?: ThoughtItem[]
  workflow_run_id?: string
  // for agent log
  conversationId?: string
  input?: any
  parentMessageId?: string | null
  siblingCount?: number
  siblingIndex?: number
  prevSibling?: string
  nextSibling?: string
  // for human input
  humanInputFormDataList?: HumanInputFormData[]
  humanInputFilledFormDataList?: HumanInputFilledFormData[]
  extra_contents?: ExtraContent[]
  isError?: boolean
  workflowProcess?: WorkflowProcess
}

export interface ChatItemInTree extends ChatItem {
  children?: ChatItemInTree[]
}

export type OnSend = {
  (message: string): void
  (message: string, isRegenerate: boolean, lastAnswer?: ChatItem | null): void
}

export type OnRegenerate = (chatItem: ChatItem, editedQuestion?: { message: string, files?: FileEntity[] }) => void

export interface Callbacks {
  onSuccess: () => void
}

