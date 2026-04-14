import * as React from 'react'
import data from './PuzzlePiece01.json'
import IconBase from '@/components/icons/IconBase'
import type { IconData } from '@/components/icons/IconBase'

export const PuzzlePiece01 = ({
  ref,
  ...props
}: React.SVGProps<SVGSVGElement> & {
  ref?: React.RefObject<React.RefObject<HTMLOrSVGElement>>;
}) => <IconBase {...props} ref={ref} data={data as IconData} />

PuzzlePiece01.displayName = 'PuzzlePiece01'

export default PuzzlePiece01
