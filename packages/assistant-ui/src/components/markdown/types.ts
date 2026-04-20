export type MdastPosition = {
  start: { line: number; column: number; offset?: number }
  end: { line: number; column: number; offset?: number }
}

export type MdastNode = {
  type: string
  position?: MdastPosition
  children?: MdastNode[]
  value?: string
  depth?: number
  tagName?: string,
  properties?: Record<string, unknown>
}
