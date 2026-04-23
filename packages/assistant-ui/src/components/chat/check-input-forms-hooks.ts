import { useCallback } from 'react'
import { toast } from '@/components/ui/toast'
import { InputVarType } from '@/app/components/workflow/types'
import { TransferMethod } from '@/types/app'
import type { InputForm } from './types'

export const useCheckInputsForms = () => {
  const checkInputsForm = useCallback((inputs: Record<string, any>, inputsForm: InputForm[]) => {
    let hasEmptyInput = ''
    let fileIsUploading = false
    const requiredVars = inputsForm.filter(({ required, type }) => required && type !== InputVarType.checkbox) // boolean can be not checked
    if (requiredVars?.length) {
      requiredVars.forEach(({ variable, label, type }) => {
        if (hasEmptyInput)
          return
        if (fileIsUploading)
          return
        if (!inputs[variable])
          hasEmptyInput = label as string
        if ((type === InputVarType.singleFile || type === InputVarType.multiFiles) && inputs[variable]) {
          const files = inputs[variable]
          if (Array.isArray(files))
            fileIsUploading = files.find(item => item.transferMethod === TransferMethod.local_file && !item.uploadedId)
          else
            fileIsUploading = files.transferMethod === TransferMethod.local_file && !files.uploadedId
        }
      })
    }
    if (hasEmptyInput) {
      toast.error(`Value of ${hasEmptyInput} is required`)
      return false
    }
    if (fileIsUploading) {
      toast.info('Please wait for the file to upload')
      return
    }
    return true
  }, [])
  
  return {
    checkInputsForm,
  }
}
