import type { Placement } from '@floating-ui/react'
import type { Dayjs } from 'dayjs'

export enum ViewType {
  Date = 'date',
  YearMonth = 'yearMonth',
  Time = 'time',
}

export enum Period {
  AM = 'AM',
  PM = 'PM',
}

export interface TriggerProps {
  value: Dayjs | undefined
  selectedDate: Dayjs | undefined
  isOpen: boolean
  onClear: (e: React.MouseEvent) => void
  onClickTrigger: (e: React.MouseEvent) => void
}

export interface DatePickerProps {
  value: Dayjs | undefined
  timezone?: string
  placeholder?: string
  disabledTimePicker?: boolean
  triggerWrapClassName?: string
  popupZIndexClassname?: string
  noConfirm?: boolean
  onChange: (date: Dayjs | undefined) => void
  onClear: () => void
  renderTrigger?: (props: TriggerProps) => React.ReactNode
  minuteFilter?: (minutes: string[]) => string[]
  getIsDateDisabled?: (date: Dayjs) => boolean
}

export type DatePickerHeaderProps = {
  currentDate: Dayjs
  onOpenYearMonthPicker: () => void
  onClickNextMonth: () => void
  onClickPrevMonth: () => void
}

export type DatePickerFooterProps = {
  disabledTimePicker: boolean
  displayTime: string
  view: ViewType
  onClickTimePicker: () => void
  onSelectCurrentDate: () => void
  onConfirm: () => void
}

export type TriggerParams = {
  isOpen: boolean
  inputElem: React.ReactNode
  onClick: (e: React.MouseEvent) => void
}
export type TimePickerProps = {
  value: Dayjs | string | undefined
  timezone?: string
  placeholder?: string
  title?: string
  popupClassName?: string
  notClearable?: boolean
  triggerFullWidth?: boolean
  showTimezone?: boolean
  placement?: Placement
  onChange: (date: Dayjs | undefined) => void
  onClear: () => void
  renderTrigger?: (props: TriggerParams) => React.ReactNode
  minuteFilter?: (minutes: string[]) => string[]
}

export type TimePickerFooterProps = {
  onSelectCurrentTime: () => void
  onConfirm: () => void
}

export interface Day {
  date: Dayjs
  isCurrentMonth: boolean
}

export type CalendarProps = {
  days: Day[]
  selectedDate: Dayjs | undefined
  wrapperClassName?: string
  onDateClick: (date: Dayjs) => void
  getIsDateDisabled?: (date: Dayjs) => boolean
}

export type CalendarItemProps = {
  day: Day
  selectedDate: Dayjs | undefined
  isDisabled: boolean
  onClick: (date: Dayjs) => void
}

export type TimeOptionsProps = {
  selectedTime: Dayjs | undefined
  minuteFilter?: (minutes: string[]) => string[]
  onSelectHour: (hour: string) => void
  onSelectMinute: (minute: string) => void
  onSelectPeriod: (period: Period) => void
}

export type YearAndMonthPickerHeaderProps = {
  selectedYear: number
  selectedMonth: number
  onClick: () => void
}

export type YearAndMonthPickerOptionsProps = {
  selectedYear: number
  selectedMonth: number
  onYearSelect: (year: number) => void
  onMonthSelect: (month: number) => void
}

export type YearAndMonthPickerFooterProps = {
  onYearMonthCancel: () => void
  onYearMonthConfirm: () => void
}
