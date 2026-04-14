import * as React from 'react'
import data from './ParameterExtractor.json'
import IconBase from '@/components/icons/IconBase'
import type { IconData } from '@/components/icons/IconBase'

export const ParameterExtractor = ({
  ref,
  ...props
}: React.SVGProps<SVGSVGElement> & {
  ref?: React.RefObject<React.RefObject<HTMLOrSVGElement>>;
}) => <IconBase {...props} ref={ref} data={data as IconData} />

ParameterExtractor.displayName = 'ParameterExtractor'

export default ParameterExtractor
