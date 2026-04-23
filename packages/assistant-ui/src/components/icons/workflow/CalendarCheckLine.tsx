import * as React from 'react'
import data from './CalendarCheckLine.json'
import IconBase from '@/components/icons/IconBase'
import type { IconData } from '@/components/icons/IconBase'

export const CalendarCheckLine = ({
  ref,
  ...props
}: React.SVGProps<SVGSVGElement> & {
  ref?: React.RefObject<React.RefObject<HTMLOrSVGElement>>;
}) => <IconBase {...props} ref={ref} data={data as IconData} />

CalendarCheckLine.displayName = 'CalendarCheckLine'

export default CalendarCheckLine
