import * as React from 'react'
import data from './ImageIndentLeft.json'
import IconBase from '@/components/icons/IconBase'
import type { IconData } from '@/components/icons/IconBase'

export const ImageIndentLeft = ({
  ref,
  ...props
}: React.SVGProps<SVGSVGElement> & {
  ref?: React.RefObject<React.RefObject<HTMLOrSVGElement>>;
}) => <IconBase {...props} ref={ref} data={data as IconData} />

ImageIndentLeft.displayName = 'ImageIndentLeft'

export default ImageIndentLeft
