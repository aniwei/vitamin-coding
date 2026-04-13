
import Button from '@/components/button'
import Checkbox from '@/components/checkbox'
import DatePicker from '@/components/date-and-time-picker/date-picker'
import TimePicker from '@/components/date-and-time-picker/time-picker'
import Input from '@/components/input'
import Textarea from '@/components/textarea'
import { useCallback, useMemo, useState } from 'react'
import { formatDateForOutput, toDayjs } from '@/components/date-and-time-picker/utils/dayjs'
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select'
import * as React from 'react'

import type { Dayjs } from 'dayjs'
import type { ButtonProps } from '@/components/button'

enum DateFormat {
  TEXT = 'text',
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

const SupportedTypes_SET = new Set<string>(Object.values(SupportedTypes))

const SAFE_NAME_RE = /^[a-z][\w-]*$/i
const PROTOTYPE_POISON_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

function isSafeName(name: unknown): name is string {
  return typeof name === 'string' && 
    name.length > 0 && 
    name.length <= 128 && 
    SAFE_NAME_RE.test(name) && 
    !PROTOTYPE_POISON_KEYS.has(name)
}

const VALID_BUTTON_VARIANTS = new Set<string>([
  'primary',
  'warning',
  'secondary',
  'secondary-accent',
  'ghost',
  'ghost-accent',
  'tertiary',
])

const VALID_BUTTON_SIZES = new Set<string>(['small', 'medium', 'large'])

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
type FormValues = Record<string, FormValue>

interface EditState {
  source: HastElement[]
  edits: FormValues
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

function computeInitialFormValues(children: HastElement[]): FormValues {
  const init: FormValues = Object.create(null) as FormValues

  for (const child of children) {
    if (child.tagName !== SupportedTags.INPUT && child.tagName !== SupportedTags.TEXTAREA) {
      continue
    }
    const name = child.properties.name
    if (!isSafeName(name))
      continue

    const type = child.tagName === SupportedTags.INPUT ? str(child.properties.type) : ''

    if (type === SupportedTypes.Hidden) {
      init[name] = str(child.properties.value)
    } else if (type === SupportedTypes.Date || type === SupportedTypes.DateTime || type === SupportedTypes.Time) {
      const raw = child.properties.value
      init[name] = raw != null ? toDayjs(String(raw)) : undefined
    } else if (type === SupportedTypes.Checkbox) {
      const { checked, value } = child.properties
      init[name] = !!checked || value === true || value === 'true'
    } else {
      init[name] = child.properties.value != null ? str(child.properties.value) : undefined
    }
  }

  return init
}

function getHastElementKey(child: HastElement, index: number): string {
  const tag = child.tagName
  const name = str(child.properties.name)
  const htmlFor = str(child.properties.htmlFor)
  const type = str(child.properties.type)

  if (tag === SupportedTags.Label) {
    return `label-${index}-${htmlFor || name}`
  } else if (tag === SupportedTags.Input) {
    return `input-${index}-${type}-${name}`
  } else if (tag === SupportedTags.Textarea) {
    return `textarea-${index}-${name}`
  } else if (tag === SupportedTags.Button) {
    return `button-${index}-${getTextContent(child)}`
  }

  return `${tag}-${index}`
}

const Unsupported: React.FC<{ tagName: string }> = ({ tagName }) => <p>Unsupported tag: {tagName}</p>

const SupportLabel: React.FC<{
  htmlFor?: string
  name?: string
  children?: React.ReactNode
}> = ({
  htmlFor,
  name,
  children
}) => {
  return <label
    htmlFor={htmlFor || name}
    className="my-2 text-text-secondary system-md-semibold"
    data-testid="label-field"
  >{children}</label>
}

const SupportCheckbox: React.FC<{
  name: string
  value: boolean
  onCheck?: () => void
  label?: string
}> = ({
  name,
  value,
  onCheck,
  label,
}) => {
  if (!isSafeName(name)) {
    return null
  }

  return (
    <div className="mt-2 flex h-6 items-center space-x-2">
      <Checkbox
        id={name}
        checked={value}
        onCheck={onCheck}
      />
      <span>{label}</span>
    </div>
  )
}

const SupportSelect: React.FC = () => {
  return <div>Unsupported select element (options parsing not implemented)</div>
}

const SupportHidden: React.FC<{
  name: string
  value: unknown
}> = ({ name, value }) => {
  return <input
    type="hidden"
    name={name}
    value={String(value)}
  />
}

const SupportInput: React.FC<{
  name: string,
  type: SupportedTypes,
  value: unknown,
  tips?: string
  onChange?: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void
  onCheck?: () => void
  onClear?: () => void
}> = ({
  name,
  type,
  value,
  tips,
  onCheck,
  onChange,
  onClear
}) => {
  if (!isSafeName(name)) {
    return null
  }

  switch (type) {
    case SupportedTypes.Date:
    case SupportedTypes.DateTime:
      return <DatePicker
        value={value as Dayjs | undefined}
        needTimePicker={type === SupportedTypes.DateTime}
        onChange={onChange}
        onClear={onClear}
      />

    case SupportedTypes.Time:
      return <TimePicker
        value={value as Dayjs | string | undefined}
        onChange={onChange}
        onClear={onClear}
      />

    case SupportedTypes.Checkbox:
      return <SupportCheckbox
        name={name}
        value={!!value}
        onCheck={() => onChange?.({
          target: {
            name,
            value: !value,
          } as any,
        } as any)}
        label={tips}
      />

    case SupportedTypes.Select:
      return <SupportSelect />

    case SupportedTypes.Hidden:
      return <SupportHidden
        name={name}
        value={value}
      />

    default:
      return <input
        className="input"
        name={name}
        type={type}
        value={str(value)}
        onChange={onChange}
      />
  }
}

interface FormProps {
  node: HastElement
  onSend?: (output: string) => void
}

export const Form: React.FC<FormProps> = React.memo(({ 
  node, 
  onSend 
}) => {
  const typedNode = node
  const [submitting, setSubmitting] = useState(false)

  const children = useMemo(() => typedNode.children.filter((c): c is HastElement => c.type === 'element'), [typedNode.children])
  const initialValues = useMemo(() => computeInitialFormValues(children), [children])

  const [editState, setEditState] = useState<EditState>(() => ({
    source: children,
    edits: {},
  }))

  const formValues = useMemo<FormValues>(() => {
    if (editState.source === children)
      return { ...initialValues, ...editState.edits }
    return initialValues
  }, [editState, initialValues, children])

  const updateValue = useCallback((name: string, value: FormValue) => {
    if (!isSafeName(name)) {
      return
    }

    setEditState(prev => ({
      source: children,
      edits: {
        ...(prev.source === children ? prev.edits : {}),
        [name]: value,
      },
    }))
  }, [children])

  const getFormOutput = useCallback((): Record<string, string | boolean | undefined> => {
    const out = Object.create(null) as Record<string, string | boolean | undefined>
    for (const child of children) {
      if (child.tagName !== SupportedTags.INPUT && child.tagName !== SupportedTags.TEXTAREA) {
        continue
      }

      const name = child.properties.name
      if (!isSafeName(name)) {
        continue
      }

      let value: FormValue = formValues[name]

      if (
        child.tagName === SupportedTags.INPUT && 
        (
          child.properties.type === SupportedTypes.DATE || 
          child.properties.type === SupportedTypes.DATETIME
        ) && 
        value != null && 
        typeof value === 'object' && 
        'format' in value
      ) {
        const includeTime = child.properties.type === SupportedTypes.DATETIME
        value = formatDateForOutput(value as Dayjs, includeTime)
      }

      if (typeof value === 'boolean') {
        out[name] = value
      } else {
        out[name] = value != null ? String(value) : undefined
      }
    }

    return out
  }, [children, formValues])

  const onSubmit = useCallback((e: React.MouseEvent) => {
    e.preventDefault()

    if (submitting) {
      return
    }

    setSubmitting(true)
    
    try {
      const format = str(typedNode.properties.dataFormat) || DateFormat.TEXT
      const result = getFormOutput()

      if (format === DateFormat.JSON) {
        onSend?.(JSON.stringify(result))
      } else {
        const text = Object.entries(result).map(([key, value]) => `${key}: ${value}`).join('\n')
        onSend?.(text)
      }
    } catch {
      setSubmitting(false)
    }
  }, [submitting, typedNode.properties.dataFormat, getFormOutput, onSend])

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
        children.map((child, index) => {
          const key = getHastElementKey(child, index)

          switch (child.tagName) {
            case SupportedTags.Label:
              return <SupportLabel 
                key={key} 
                htmlFor={child.properties.htmlFor as string}
                name={child.properties.name as string}
              >{getTextContent(child)}</SupportLabel>

            case SupportedTags.Input: 
              return <SupportInput 
                key={key}
              />
          }

          if (child.tagName === SupportedTags.Input && SupportedTypes_SET.has(str(child.properties.type))) {
            const name = str(child.properties.name)
            if (!isSafeName(name))
              return null

            const type = str(child.properties.type) as SupportedTypes

            if (type === SupportedTypes.DATE || type === SupportedTypes.DATETIME) {
              return (
                <DatePicker
                  key={key}
                  value={formValues[name] as Dayjs | undefined}
                  needTimePicker={type === SupportedTypes.DATETIME}
                  onChange={date => updateValue(name, date)}
                  onClear={() => updateValue(name, undefined)}
                />
              )
            }
            if (type === SupportedTypes.TIME) {
              return (
                <TimePicker
                  key={key}
                  value={formValues[name] as Dayjs | string | undefined}
                  onChange={time => updateValue(name, time)}
                  onClear={() => updateValue(name, undefined)}
                />
              )
            }
            if (type === SupportedTypes.CHECKBOX) {
              return (
                <div className="mt-2 flex h-6 items-center space-x-2" key={key}>
                  <Checkbox
                    checked={!!formValues[name]}
                    onCheck={() => updateValue(name, !formValues[name])}
                    id={name}
                  />
                  <span>{str(child.properties.dataTip || child.properties['data-tip'])}</span>
                </div>
              )
            }
            if (type === SupportedTypes.SELECT) {
              const rawOptions = child.properties.dataOptions || child.properties['data-options'] || []
              let options: string[] = []
              if (typeof rawOptions === 'string') {
                try {
                  const parsed: unknown = JSON.parse(rawOptions)
                  if (Array.isArray(parsed))
                    options = parsed.filter((o): o is string => typeof o === 'string')
                }
                catch (error) {
                  console.error('Failed to parse data-options JSON:', rawOptions, error)
                  options = []
                }
              }
              else if (Array.isArray(rawOptions)) {
                options = rawOptions.filter((o): o is string => typeof o === 'string')
              }
              return (
                <Select
                  key={key}
                  defaultValue={formValues[name] as string | undefined}
                  onValueChange={val => updateValue(name, val as string)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {options.map(option => (
                      <SelectItem key={option} value={option}>{option}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )
            }

            if (type === SupportedTypes.HIDDEN) {
              return (
                <input
                  key={key}
                  type="hidden"
                  name={name}
                  value={str(formValues[name] ?? child.properties.value)}
                />
              )
            }

            return (
              <Input
                key={key}
                type={type}
                name={name}
                placeholder={str(child.properties.placeholder)}
                value={str(formValues[name])}
                onChange={e => updateValue(name, e.target.value)}
              />
            )
          }

          if (child.tagName === SupportedTags.TEXTAREA) {
            const name = str(child.properties.name)
            if (!isSafeName(name))
              return null
            return (
              <Textarea
                key={key}
                name={name}
                placeholder={str(child.properties.placeholder)}
                value={str(formValues[name])}
                onChange={e => updateValue(name, e.target.value)}
              />
            )
          }

          if (child.tagName === SupportedTags.BUTTON) {
            const rawVariant = str(child.properties.dataVariant)
            const rawSize = str(child.properties.dataSize)
            const variant = VALID_BUTTON_VARIANTS.has(rawVariant)
              ? rawVariant as ButtonProps['variant']
              : undefined
            const size = VALID_BUTTON_SIZES.has(rawSize)
              ? rawSize as ButtonProps['size']
              : undefined

            return (
              <Button
                className="mt-4"
                variant={variant}
                size={size}
                key={key}
                disabled={submitting}
                onClick={onSubmit}
              ><span className="text-[13px]">{getTextContent(child)}</span></Button>
            )
          }

          return <Unsupported key={key} tagName={child.tagName} />
        })
      }
    </form>
  )
})

Form.displayName = 'Form'

export default Form
