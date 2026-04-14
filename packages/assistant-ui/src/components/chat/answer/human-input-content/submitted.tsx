import ExecutedAction from './executed-action'
import SubmittedContent from './submitted-content'
import { useMemo } from 'react'
import type { SubmittedHumanInputContentProps } from './types'

export const SubmittedHumanInputContent = ({
  formData,
}: SubmittedHumanInputContentProps) => {
  const { rendered_content, action_id, action_text } = formData

  const executedAction = useMemo(() => {
    return {
      id: action_id,
      title: action_text,
    }
  }, [action_id, action_text])

  return (
    <>
      <SubmittedContent content={rendered_content} />
      {/* Executed Action */}
      <ExecutedAction executedAction={executedAction} />
    </>
  )
}
