import * as React from 'react'
import data from './AzureOpenaiService.json'
import IconBase from '@/components/icons/IconBase'
import type { IconData } from '@/components/icons/IconBase'

export const AzureOpenaiService = ({
  ref,
  ...props
}: React.SVGProps<SVGSVGElement> & {
  ref?: React.RefObject<React.RefObject<HTMLOrSVGElement>>;
}) => <IconBase {...props} ref={ref} data={data as IconData} />

AzureOpenaiService.displayName = 'AzureOpenaiService'

export default AzureOpenaiService
