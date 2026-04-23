import * as React from 'react'
import data from './MessageSmileSquare.json'
import IconBase from '@/components/icons/IconBase'
import type { IconData } from '@/components/icons/IconBase'

export const MessageSmileSquare = ({
  ref,
  ...props
}: React.SVGProps<SVGSVGElement> & {
  ref?: React.RefObject<React.RefObject<HTMLOrSVGElement>>;
}) => <IconBase {...props} ref={ref} data={data as IconData} />

MessageSmileSquare.displayName = 'MessageSmileSquare'

export default MessageSmileSquare
