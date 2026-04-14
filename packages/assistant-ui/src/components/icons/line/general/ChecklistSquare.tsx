import * as React from 'react'
import data from './ChecklistSquare.json'
import IconBase from '@/components/icons/IconBase'
import type { IconData } from '@/components/icons/IconBase'

export const ChecklistSquare = ({
  ref,
  ...props
}: React.SVGProps<SVGSVGElement> & {
  ref?: React.RefObject<React.RefObject<HTMLOrSVGElement>>;
}) => <IconBase {...props} ref={ref} data={data as IconData} />

ChecklistSquare.displayName = 'ChecklistSquare'

export default ChecklistSquare
