/**
 * Enum defining all available node types in the workflow system.
 */
export enum NodeKind {
  Input = 'input',
  LLM = 'llm',
  Condition = 'condition',
  Note = 'note',
  Tool = 'tool',
  Http = 'http',
  Template = 'template',
  Code = 'code',
  Output = 'output',
}
