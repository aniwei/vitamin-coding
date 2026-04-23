import * as React from 'react'
import data from './KnowledgeBase.json'
import IconBase from '@/components/icons/IconBase'
import type { IconData } from '@/components/icons/IconBase'

export const KnowledgeBase = ({
  ref,
  ...props
}: React.SVGProps<SVGSVGElement> & {
  ref?: React.RefObject<React.RefObject<HTMLOrSVGElement>>;
}) => <IconBase {...props} ref={ref} data={data as IconData} />

KnowledgeBase.displayName = 'KnowledgeBase'

export default KnowledgeBase
