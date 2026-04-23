import * as React from 'react'
import data from './ParentChildChunk.json'
import IconBase from '@/components/icons/IconBase'
import type { IconData } from '@/components/icons/IconBase'

export const ParentChildChunk = ({
  ref,
  ...props
}: React.SVGProps<SVGSVGElement> & {
  ref?: React.RefObject<React.RefObject<HTMLOrSVGElement>>;
}) => <IconBase {...props} ref={ref} data={data as IconData} />

ParentChildChunk.displayName = 'ParentChildChunk'

export default ParentChildChunk
