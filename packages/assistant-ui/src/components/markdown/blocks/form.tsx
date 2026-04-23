
import Button from '@/components/button'
import Checkbox from '@/components/checkbox'
// import DatePicker from '@/app/components/base/date-and-time-picker/date-picker'
// import TimePicker from '@/app/components/base/date-and-time-picker/time-picker'
// import { formatDateForOutput, toDayjs } from '@/app/components/base/date-and-time-picker/utils/dayjs'
import Input from '@/components/input'
import Textarea from '@/components/textarea'
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select'
import { isValidButtonVariant } from '../shared'
import { 
  useCallback, 
  useMemo, 
  useState 
} from 'react'
import * as React from 'react'
import type { Dayjs } from 'dayjs'
import type { ButtonProps } from '@/components/button'

enum DataFormat {
  Text = 'text',
  JSON = 'json',
}

enum SupportedTags {
  Label = 'label',
  Input = 'input',
  Textarea = 'textarea',
  Button = 'button',
}

enum SupportedTypes {
  Text = 'text',
  Password = 'password',
  Email = 'email',
  Number = 'number',
  Date = 'date',
  Time = 'time',
  DateTime = 'datetime',
  Checkbox = 'checkbox',
  Select = 'select',
  Hidden = 'hidden',
}

const supportedTypesSet = new Set<string>(Object.values(SupportedTypes))

const SAFE_NAME_RE = /^[a-z][\w-]*$/i
const PROTOTYPE_POISON_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

function isSafeName(name: unknown): name is string {
  return typeof name === 'string'
    && name.length > 0
    && name.length <= 128
    && SAFE_NAME_RE.test(name)
    && !PROTOTYPE_POISON_KEYS.has(name)
}

const validButtonSizes = new Set<string>(['small', 'medium', 'large'])

function isValidButtonSize(size: string): boolean {
  return validButtonSizes.has(size)
}

interface HastText {
  type: 'text'
  value: string
}

interface HastElement {
  type: 'element'
  tagName: string
  properties: Record<string, unknown>
  children: Array<HastElement | HastText>
}

type FormValue = string | boolean | Dayjs | undefined
interface FormData extends Record<string, FormValue> {}

interface EditState {
  source: HastElement[]
  data: FormData
}

function getTextContent(node: HastElement): string {
  const textChild = node.children.find((c): c is HastText => c.type === 'text')
  return textChild?.value ?? ''
}

function str(val: unknown): string {
  if (val == null)
    return ''
  return String(val)
}

function computeInitialFormValues(children: HastElement[]): FormData {
  const data: FormData = Object.create(null) as FormData

  for (const child of children) {
    const tagName = child.tagName

    if (
      tagName !== SupportedTags.Input && 
      tagName !== SupportedTags.Textarea
    ) {
      continue
    }

    const name = child.properties.name
    if (!isSafeName(name)) {
      continue
    }

    const type = child.tagName === SupportedTags.Input 
      ? child.properties.type ?? ''
      : ''

    if (type === SupportedTypes.Hidden) {
      data[name] = child.properties.value as string ?? ''
    } else if (
      type === SupportedTypes.Date || 
      type === SupportedTypes.DateTime || 
      type === SupportedTypes.Time
    ) {
      // TODO
      // const raw = child.properties.value
      // data[name] = raw != null ? toDayjs(String(raw)) : undefined
    } else if (type === SupportedTypes.Checkbox) {
      const { checked, value } = child.properties
      data[name] = !!checked || value === true || value === 'true'
    } else {
      data[name] = child.properties.value !== null 
        ? child.properties.value as string ?? '' 
        : undefined
    }
  }

  return data
}

function getHastElementKey(child: HastElement, index: number): string {
  const tag = child.tagName
  const name = child.properties.name ?? ''
  const htmlFor = child.properties.htmlFor ?? ''
  const type = child.properties.type ?? ''

  if (tag === SupportedTags.Label)
    return `label-${index}-${htmlFor || name}`
  if (tag === SupportedTags.Input)
    return `input-${index}-${type}-${name}`
  if (tag === SupportedTags.Textarea)
    return `textarea-${index}-${name}`
  if (tag === SupportedTags.Button)
    return `button-${index}-${getTextContent(child)}`
  return `${tag}-${index}`
}

interface UnsupportedElementProps {
  tagName: string
  key: string
}

const UnsupportedElement: React.FC<UnsupportedElementProps> = ({ tagName, key }) => {
  return (
    <p key={key}>
      Unsupported tag:
      {tagName}
    </p>
  )
}

interface SupportedLabelProps {
  key: string,
  htmlFor: string,
  textContent?: string,
}

const SupportedLabel: React.FC<SupportedLabelProps> = ({
  key,
  htmlFor,
  textContent,
}) => {
  return <label
    key={key}
    htmlFor={htmlFor}
    className="my-2 text-text-secondary system-md-semibold"
    data-testid="label-field"
  >{textContent}</label>
}

interface SupportedSelectProps {
  key: string,
  name: string,
  options: string[],
  value?: string,
  onChange?: (name: string, value: string) => void,
}

const SupportedSelect: React.FC<SupportedSelectProps> = ({
  key,
  name,
  options,
  value,
  onChange
}) => {
  
  return (
    <Select
      key={key}
      defaultValue={value as string | undefined}
      onValueChange={val => onChange?.(name, val as string)}
    >
      <SelectTrigger className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {
          options.map(option => <SelectItem 
              key={option} 
              value={option}
            >{option}</SelectItem>
          )
        }
      </SelectContent>
    </Select>
  )
}
    
interface SupportedHiddenProps {
  key: string,
  name: string,
  value?: string,
}

const SupportedHidden: React.FC<SupportedHiddenProps> = ({
  key,
  name,
  value
}) => {
  return <input type="hidden" key={key} name={name} value={value} />
}

interface SupportedCheckboxProps {
  key: string,
  id: string,
  checked?: boolean,
  onCheck?: (event: React.MouseEvent<HTMLDivElement> | React.KeyboardEvent<HTMLDivElement>) => void,
}

const SupportedCheckbox: React.FC<SupportedCheckboxProps> = ({
  key,
  id,
  checked,
  onCheck,
}) => {
  return (
    <div className="mt-2 flex h-6 items-center space-x-2" key={key}>
      <Checkbox
        id={id}
        checked={checked}
        onCheck={onCheck}
      />
      <span data-testid="checkbox-tip">{id}</span>
    </div>
  )
}

interface SupportedInputProps {
  key: string,
  type: SupportedTypes,
  name: string,
  options?: string[],
  placeholder?: string,
  value?: FormValue,
  onChange?: (name: string, value: FormValue) => void,
}

const SupportedInput: React.FC<SupportedInputProps> = ({
  key,
  type,
  name,
  options,
  placeholder,
  value,
  onChange
}) => {
  switch (type) {
    case SupportedTypes.Date:
    case SupportedTypes.DateTime: {
      return <UnsupportedElement key={key} tagName={type} />
    }

    case SupportedTypes.Time: {
      return <UnsupportedElement key={key} tagName={type} />
    }
    
    case SupportedTypes.Checkbox: 
      return <SupportedCheckbox 
        checked={!!value}
        onCheck={() => onChange?.(name, !(value as boolean))}
        key={key}
        id={name}
      />

    case SupportedTypes.Select: 
      return <SupportedSelect 
        key={key}
        name={name}
        options={options ?? []}
        value={value as string | undefined}
        onChange={onChange}
      />

    case SupportedTypes.Hidden:
      return <SupportedHidden 
        key={key}
        name={name}
        value={value as string}
      />

    default:
      return <Input 
        key={key}
        type={type}
        name={name}
        placeholder={placeholder}
        value={value as string}
        onChange={e => onChange?.(name, e.target.value)}
      />
  }
}

interface SupportedFormElementProps {
  key: string,
  tagName: string,
  textContent?: string,
  value?: FormValue
  disabled?: boolean
  properties: Record<string, unknown>
  onSubmit?: (e: React.MouseEvent<HTMLButtonElement>) => void
  onChange?: (name: string, value: FormValue) => void
}

const SupportedFormElement: React.FC<SupportedFormElementProps> = ({
  key,
  value,
  tagName,
  textContent,
  properties,
  disabled,
  onChange,
  onSubmit
}) => {
  switch (tagName) {
    case SupportedTags.Label:
      return <SupportedLabel
        key={key}
        htmlFor={properties.htmlFor as string ?? properties.for as string ?? ''}
        textContent={textContent}
      />

    case SupportedTags.Input: {
      return <SupportedInput
        key={key}
        type={str(properties.type) as SupportedTypes}
        name={str(properties.name)}
        placeholder={str(properties.placeholder)}
        value={properties.value as FormValue}
        onChange={onChange}
      />
    }

    case SupportedTags.Textarea: {
      if (!isSafeName(properties.name)) {
        return null
      }

      return <Textarea
        key={key}
        name={properties.name}
        placeholder={properties.placeholder as string ?? ''}
        value={value as string}
        onChange={e => onChange?.(properties.name as string, e.target.value as string)}
      />
    }

    case SupportedTags.Button: {
      const { dataVariant, dataSize } = properties
      const variant = isValidButtonVariant(dataVariant as string ?? '')
        ? dataVariant as ButtonProps['variant']
        : undefined
      const size = isValidButtonSize(dataSize as string ?? '')
        ? dataSize as ButtonProps['size']
        : undefined

      return <Button
          variant={variant}
          size={size}
          className="mt-4"
          key={key}
          disabled={disabled}
          onClick={onSubmit}
        >
          <span className="text-[13px]">{textContent}</span>
        </Button>
    }
  }

  return <UnsupportedElement key={key} tagName={tagName} />
}

interface FormProps {
  node: HastElement
  onSend?: (output: string) => void
}

export const Form: React.FC<FormProps> = ({ node, onSend }) => {
  const [submitting, setSubmitting] = useState(false)

  const elements = useMemo(() => {
    return node.children.filter((c): c is HastElement => c.type === 'element')
  }, [node.children])

  const initialValues = useMemo(() => {
    return computeInitialFormValues(elements)
  }, [elements])

  const [editState, setEditState] = useState<EditState>(() => ({
    source: elements,
    data: {},
  }))

  const formData = useMemo<FormData>(() => {
    if (editState.source === elements) {
      return { ...initialValues, ...editState.data }
    }
    return initialValues
  }, [editState, initialValues, elements])

  const onChange = useCallback((name: string, value: FormValue) => {
    if (!isSafeName(name)) {
      return
    }

    setEditState(prev => ({
      source: elements,
      data: {
        ...(prev.source === elements ? prev.data : {}),
        [name]: value,
      },
    }))
  }, [elements])

  const getFormOutput = useCallback((): Record<string, string | boolean | undefined> => {
    const out = Object.create(null) as Record<string, string | boolean | undefined>
    for (const child of elements) {
      const tagName = child.tagName

      if (
        tagName !== SupportedTags.Input && 
        tagName !== SupportedTags.Textarea
      ) {
        continue
      }

      const name = child.properties.name
      if (!isSafeName(name)) {
        continue
      }

      let value: FormValue = formData[name]
      const type = child.properties.type as SupportedTypes

      if (
        tagName === SupportedTags.Input && 
        (
          type === SupportedTypes.Date || 
          type === SupportedTypes.DateTime
        ) && 
        value != null && 
        typeof value === 'object'&& 
        'format' in value
      ) {
        // TODO
        // const includeTime = type === SupportedTypes.DateTime
        // value = formatDateForOutput(value as Dayjs, includeTime)
      }

      if (typeof value === 'boolean') {
        out[name] = value
      } else {
        out[name] = value !== null 
          ? String(value) 
          : undefined
      }
    }

    return out
  }, [elements, formData])

  const onSubmit = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    if (submitting) {
      return
    }

    setSubmitting(true)
    
    try {
      const format = (node.properties.dataFormat ?? '') || DataFormat.Text
      const result = getFormOutput()
      if (format === DataFormat.JSON) {
        onSend?.(JSON.stringify(result))
      } else {
        const textResult = Object.entries(result)
          .map(([key, value]) => `${key}: ${value}`)
          .join('\n')

        onSend?.(textResult)
      }
    } catch {
      setSubmitting(false)
    }
  }, [submitting, node.properties.dataFormat, getFormOutput, onSend])

  return (
    <form
      autoComplete="off"
      className="flex flex-col self-stretch"
      data-testid="markdown-form"
      onSubmit={(e) => {
        e.preventDefault()
        e.stopPropagation()
      }}
    >
      {
        elements.map((child, index) => {
          const props: SupportedFormElementProps = {
            key: getHastElementKey(child, index),
            tagName: child.tagName,
            textContent: getTextContent(child),
            properties: {
              htmlFor: child.properties.htmlFor,
              type: child.properties.type,
              name: child.properties.name,
              placeholder: child.properties.placeholder,
            }
          }

          return <SupportedFormElement 
            {...props} 
            onSubmit={onSubmit}
            onChange={(name, value) => onChange(name, value)}
          />
        })
      }
    </form>
  )
}

Form.displayName = 'Form'
export default Form
