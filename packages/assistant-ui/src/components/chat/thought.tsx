import ToolDetail from './tool-detail'
import * as React from 'react'
import type { FC } from 'react'
import type { ThoughtItem, ToolInfoInThought } from './types'

export type ThoughtProps = {
  thought: ThoughtItem
  isFinished: boolean
}

function getValue(value: string, isValueArray: boolean, index: number) {
  if (isValueArray) {
    try {
      return JSON.parse(value)[index]
    } catch { }
  }

  return value
}

function tryParseToolInput(input: string) {
  try {
    const parsed = JSON.parse(input)
    if (Array.isArray(parsed)) {
      return parsed
    }
  } catch { }

  return input
}

export const Thought: FC<ThoughtProps> = React.memo(({
  thought,
  isFinished,
}) => {
  const [toolNames, isValueArray]: [string[], boolean] = (() => {
    try {
      if (Array.isArray(JSON.parse(thought.tool))) {
        return [JSON.parse(thought.tool), true]
      }
    } catch { }

    return [[thought.tool], false]
  })()

  const tools = toolNames.map((toolName, index) => {
    return {
      name: toolName,
      label: thought.tool_labels?.toolName?.language ?? toolName,
      input: getValue(thought.tool_input, isValueArray, index),
      output: getValue(thought.observation, isValueArray, index),
      isFinished,
    }
  })

  return (
    <div className="my-2 space-y-2">
      {
        tools.map((
          item: ToolInfoInThought, 
          index
        ) => <ToolDetail
          key={index}
          payload={item}
        />)
      }
    </div>
  )
})

Thought.displayName = 'Thought'
export default Thought
