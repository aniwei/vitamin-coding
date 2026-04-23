import * as React from 'react'
import data from './QuestionAndAnswer.json'
import IconBase from '@/components/icons/IconBase'
import type { IconData } from '@/components/icons/IconBase'

export const QuestionAndAnswer = ({
  ref,
  ...props
}: React.SVGProps<SVGSVGElement> & {
  ref?: React.RefObject<React.RefObject<HTMLOrSVGElement>>;
}) => <IconBase {...props} ref={ref} data={data as IconData} />

QuestionAndAnswer.displayName = 'QuestionAndAnswer'

export default QuestionAndAnswer
