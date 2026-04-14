import * as React from 'react'
import data from './MessageCheckRemove.json'
import IconBase from '@/components/icons/IconBase'
import type { IconData } from '@/components/icons/IconBase'

export const MessageCheckRemove = ({
  ref,
  ...props
}: React.SVGProps<SVGSVGElement> & {
  ref?: React.RefObject<React.RefObject<HTMLOrSVGElement>>;
}) => <IconBase {...props} ref={ref} data={data as IconData} />

MessageCheckRemove.displayName = 'MessageCheckRemove'

export default MessageCheckRemove
