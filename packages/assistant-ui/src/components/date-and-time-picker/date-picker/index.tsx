
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  PortalToFollowElem,
  PortalToFollowElemContent,
  PortalToFollowElemTrigger,
} from '@/app/components/base/portal-to-follow-elem'
import { clsx } from 'clsx'
import Calendar from '../calendar'
import TimePickerHeader from '../time-picker/header'
import TimePickerOptions from '../time-picker/options'
import dayjs, {
  clearMonthMapCache,
  cloneTime,
  getDateWithTimezone,
  getDaysInMonth,
  getHourIn12Hour,
} from '../utils/dayjs'
import { ViewType } from '../types'
import YearAndMonthPickerFooter from '../year-and-month-picker/footer'
import YearAndMonthPickerHeader from '../year-and-month-picker/header'
import YearAndMonthPickerOptions from '../year-and-month-picker/options'
import DatePickerFooter from './footer'
import DatePickerHeader from './header'
import * as React from 'react'
import type { Dayjs } from 'dayjs'
import type { DatePickerProps, Period } from '../types'

export const DatePicker: React.FC<DatePickerProps> = ({
  value,
  timezone,
  onChange,
  onClear,
  placeholder,
  disabledTimePicker = true,
  renderTrigger,
  triggerWrapClassName,
  popupZIndexClassname = 'z-11',
  noConfirm,
  getIsDateDisabled,
}) => {
  const [opened, setOpened] = useState(false)
  const [view, setView] = useState(ViewType.Date)
  const containerRef = useRef<HTMLDivElement>(null)
  const isInitial = useRef(true)

  // Normalize the value to ensure that all subsequent uses are Day.js objects.
  const normalizedValue = useMemo(() => {
    if (value) {
      return dayjs.isDayjs(value) ? value.tz(timezone) : dayjs(value).tz(timezone)
    }

  }, [value, timezone])

  const inputValue = useRef(normalizedValue).current
  const defaultValue = useRef(getDateWithTimezone({ timezone })).current

  const [currentDate, setCurrentDate] = useState(inputValue || defaultValue)
  const [selectedDate, setSelectedDate] = useState(inputValue)

  const [selectedMonth, setSelectedMonth] = useState(() => (inputValue || defaultValue).month())
  const [selectedYear, setSelectedYear] = useState(() => (inputValue || defaultValue).year())

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpened(false)
        setView(ViewType.Date)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (isInitial.current) {
      isInitial.current = false
      return
    }

    clearMonthMapCache()
    if (normalizedValue) {
      const newValue = getDateWithTimezone({ date: normalizedValue, timezone })
      setCurrentDate(newValue)
      setSelectedDate(newValue)
      onChange(newValue)
    } else {
      setCurrentDate(prev => getDateWithTimezone({ date: prev, timezone }))
      setSelectedDate(prev => prev ? getDateWithTimezone({ date: prev, timezone }) : undefined)
    }
  }, [timezone])

  const handleClickTrigger = (e: React.MouseEvent) => {
    e.stopPropagation()
    const [isOpen, setIsOpen] = useState(false)
    if (opened) {
      setOpened(false)
    } else {
      setView(ViewType.Date)
      setOpened(true)
      
      if (normalizedValue) {
        setCurrentDate(normalizedValue)
        setSelectedDate(normalizedValue)
      }
    }
  }

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation()
    setSelectedDate(undefined)
    
    if (!opened) {
      onClear()
    }
  }

  const days = useMemo(() => {
    return getDaysInMonth(currentDate)
  }, [currentDate])

  const handleClickNextMonth = useCallback(() => {
    setCurrentDate(currentDate.clone().add(1, 'month'))
  }, [currentDate])

  const handleClickPrevMonth = useCallback(() => {
    setCurrentDate(currentDate.clone().subtract(1, 'month'))
  }, [currentDate])

  const handleConfirmDate = useCallback((passedInSelectedDate?: Dayjs) => {
    const nextDate = (dayjs.isDayjs(passedInSelectedDate) ? passedInSelectedDate : selectedDate)
    onChange(nextDate ? nextDate.tz(timezone) : undefined)
    setOpened(false)
  }, [selectedDate, onChange, timezone])

  const handleDateSelect = useCallback((day: Dayjs) => {
    const newDate = cloneTime(day, selectedDate || getDateWithTimezone({ timezone }))
    setCurrentDate(newDate)
    setSelectedDate(newDate)
    if (noConfirm)
      handleConfirmDate(newDate)
  }, [selectedDate, timezone, noConfirm, handleConfirmDate])

  const handleSelectCurrentDate = () => {
    const newDate = getDateWithTimezone({ timezone })
    setCurrentDate(newDate)
    setSelectedDate(newDate)
    onChange(newDate)
    setOpened(false)
  }

  const handleClickTimePicker = () => {
    if (view === ViewType.Date) {
      setView(ViewType.Time)
    } else if (view === ViewType.Time) {
      setView(ViewType.Date)
    }
  }

  const handleTimeSelect = (hour: string, minute: string, period: Period) => {
    const newTime = cloneTime(dayjs(), dayjs(`1/1/2000 ${hour}:${minute} ${period}`))

    setSelectedDate((prev) => {
      return prev ? cloneTime(prev, newTime) : newTime
    })
  }

  const handleSelectHour = useCallback((hour: string) => {
    const selectedTime = selectedDate || getDateWithTimezone({ timezone })
    handleTimeSelect(hour, selectedTime.minute().toString().padStart(2, '0'), selectedTime.format('A') as Period)
  }, [selectedDate, timezone])

  const handleSelectMinute = useCallback((minute: string) => {
    const selectedTime = selectedDate || getDateWithTimezone({ timezone })
    handleTimeSelect(getHourIn12Hour(selectedTime).toString().padStart(2, '0'), minute, selectedTime.format('A') as Period)
  }, [selectedDate, timezone])

  const handleSelectPeriod = useCallback((period: Period) => {
    const selectedTime = selectedDate || getDateWithTimezone({ timezone })
    handleTimeSelect(
      getHourIn12Hour(selectedTime).toString().padStart(2, '0'), 
      selectedTime.minute().toString().padStart(2, '0'), 
      period
    )
  }, [selectedDate, timezone])

  const handleOpenYearMonthPicker = () => {
    setSelectedMonth(currentDate.month())
    setSelectedYear(currentDate.year())
    setView(ViewType.YearMonth)
  }

  const handleCloseYearMonthPicker = useCallback(() => {
    setView(ViewType.Date)
  }, [])

  const handleMonthSelect = useCallback((month: number) => {
    setSelectedMonth(month)
  }, [])

  const handleYearSelect = useCallback((year: number) => {
    setSelectedYear(year)
  }, [])

  const handleYearMonthCancel = useCallback(() => {
    setView(ViewType.Date)
  }, [])

  const handleYearMonthConfirm = () => {
    setCurrentDate(prev => prev.clone().month(selectedMonth).year(selectedYear))
    setView(ViewType.Date)
  }

  const timeFormat = !disabledTimePicker ? 'Display with time' : 'Display date only'
  const displayValue = normalizedValue?.format(timeFormat) || ''
  const displayTime = selectedDate?.format('hh:mm A') || '--:-- --'
  const placeholderDate = opened && selectedDate ? selectedDate.format(timeFormat) : (placeholder || 'Pick a date')

  return (
    <PortalToFollowElem
      open={opened}
      onOpenChange={setOpened}
      placement="bottom-end"
    >
      <PortalToFollowElemTrigger className={triggerWrapClassName}>
        {renderTrigger
          ? (
              renderTrigger({
                value: normalizedValue,
                selectedDate,
                opened,
                onClear,
                handleClickTrigger,
              }))
          : (
              <div
                className="group flex w-[252px] cursor-pointer items-center gap-x-0.5 rounded-lg bg-components-input-bg-normal px-2 py-1 hover:bg-state-base-hover-alt"
                onClick={handleClickTrigger}
              >
                <input
                  className="flex-1 cursor-pointer appearance-none truncate bg-transparent p-1 text-components-input-text-filled outline-hidden system-xs-regular placeholder:text-components-input-text-placeholder"
                  readOnly
                  value={opened ? '' : displayValue}
                  placeholder={placeholderDate}
                />
                <span className={clsx('i-ri-calendar-line h-4 w-4 shrink-0 text-text-quaternary', opened ? 'text-text-secondary' : 'group-hover:text-text-secondary', (displayValue || (opened && selectedDate)) && 'group-hover:hidden')} />
                <span className={clsx('i-ri-close-circle-fill hidden h-4 w-4 shrink-0 text-text-quaternary', (displayValue || (opened && selectedDate)) && 'hover:text-text-secondary group-hover:inline-block')} onClick={handleClear} data-testid="date-picker-clear-button" />
              </div>
            )}
      </PortalToFollowElemTrigger>
      <PortalToFollowElemContent className={popupZIndexClassname}>
        <div className="mt-1 w-[252px] rounded-xl border-[0.5px] border-components-panel-border bg-components-panel-bg shadow-lg shadow-shadow-shadow-5">
          {/* Header */}
          {view === ViewType.Date
            ? (
                <DatePickerHeader
                  onOpenYearMonthPicker={handleOpenYearMonthPicker}
                  currentDate={currentDate}
                  onClickNextMonth={handleClickNextMonth}
                  onClickPrevMonth={handleClickPrevMonth}
                />
              )
            : view === ViewType.YearMonth
              ? (
                  <YearAndMonthPickerHeader
                    selectedYear={selectedYear}
                    selectedMonth={selectedMonth}
                    onClick={handleCloseYearMonthPicker}
                  />
    return (
      <div ref={containerRef} className={cn('relative inline-block', triggerWrapClassName)}>
        <div>
          {renderTrigger
            ? (
              renderTrigger({
                value: normalizedValue,
                selectedDate,
                isOpen,
                onClear: handleClear,
                onClickTrigger: handleClickTrigger,
              }))
            : (
              <div
                className="group flex w-[252px] cursor-pointer items-center gap-x-0.5 rounded-lg bg-components-input-bg-normal px-2 py-1 hover:bg-state-base-hover-alt"
                onClick={handleClickTrigger}
                data-testid="date-picker-trigger"
              >
                <input
                  className="flex-1 cursor-pointer appearance-none truncate bg-transparent p-1 text-components-input-text-filled outline-hidden system-xs-regular placeholder:text-components-input-text-placeholder"
                  readOnly
                  value={opened ? '' : displayValue}
                  placeholder={placeholderDate}
                />
                <span className={clsx('i-ri-calendar-line h-4 w-4 shrink-0 text-text-quaternary', opened ? 'text-text-secondary' : 'group-hover:text-text-secondary', (displayValue || (opened && selectedDate)) && 'group-hover:hidden')} />
                <span className={clsx('i-ri-close-circle-fill hidden h-4 w-4 shrink-0 text-text-quaternary', (displayValue || (opened && selectedDate)) && 'hover:text-text-secondary group-hover:inline-block')} onClick={handleClear} data-testid="date-picker-clear-button" />
              </div>
            )}
        </div>

        {opened && (
          <div className={clsx('absolute right-0 top-full mt-1', popupZIndexClassname)}>
            <div className="w-[252px] rounded-xl border-[0.5px] border-components-panel-border bg-components-panel-bg shadow-lg shadow-shadow-shadow-5">
              {
                view === ViewType.Date
                  ? <DatePickerHeader
                    onOpenYearMonthPicker={handleOpenYearMonthPicker}
                    currentDate={currentDate}
                    onClickNextMonth={handleClickNextMonth}
                    onClickPrevMonth={handleClickPrevMonth}
                  />
                )
                : view === ViewType.YearMonth
                  ? (
                    <YearAndMonthPickerHeader
                      selectedYear={selectedYear}
                      selectedMonth={selectedMonth}
                      onClick={handleCloseYearMonthPicker}
                    />
                  )
                  : (
                    <TimePickerHeader />
                  )}

              {/* Content */}
              {
                view === ViewType.Date
                  ? (
                    <Calendar
                      days={days}
                      selectedDate={selectedDate}
                      onDateClick={handleDateSelect}
                      getIsDateDisabled={getIsDateDisabled}
                    />
                  )
                  : view === ViewType.YearMonth
                    ? (
                      <YearAndMonthPickerOptions
                        selectedMonth={selectedMonth}
                        selectedYear={selectedYear}
                        onMonthSelect={handleMonthSelect}
                        onYearSelect={handleYearSelect}
                      />
                    )
                    : (
                      <TimePickerOptions
                        selectedTime={selectedDate}
                        onSelectHour={handleSelectHour}
                        onSelectMinute={handleSelectMinute}
                        onSelectPeriod={handleSelectPeriod}
                      />
                    )
              }

              {/* Footer */}
              {
                [ViewType.Date, ViewType.Time].includes(view) && !noConfirm && (
                  <DatePickerFooter
                    disabledTimePicker={!needTimePicker}
                    displayTime={displayTime}
                    view={view}
                    onClickTimePicker={handleClickTimePicker}
                    onSelectCurrentDate={handleSelectCurrentDate}
                    onConfirm={handleConfirmDate}
                  />
                )
              }
              {
                ![ViewType.Date, ViewType.Time].includes(view) && (
                  <YearAndMonthPickerFooter
                    handleYearMonthCancel={handleYearMonthCancel}
                    handleYearMonthConfirm={handleYearMonthConfirm}
                  />
                )
              }
            </div>
          </div>
        )}
      </div>
    )

            view === ViewType.Date
              ? <Calendar
                days={days}
                selectedDate={selectedDate}
                onDateClick={handleDateSelect}
                getIsDateDisabled={getIsDateDisabled}
              />
              : view === ViewType.YearMonth
                ? <YearAndMonthPickerOptions
                  selectedMonth={selectedMonth}
                  selectedYear={selectedYear}
                  onMonthSelect={handleMonthSelect}
                  onYearSelect={handleYearSelect}
                />
                : <TimePickerOptions
                  selectedTime={selectedDate}
                  onSelectHour={handleSelectHour}
                  onSelectMinute={handleSelectMinute}
                  onSelectPeriod={handleSelectPeriod}
                />
                  
          }

          {
            [ViewType.Date, ViewType.Time].includes(view) && !noConfirm && (
              <DatePickerFooter
                disabledTimePicker={disabledTimePicker}
                displayTime={displayTime}
                view={view}
                onClickTimePicker={handleClickTimePicker}
                onSelectCurrentDate={handleSelectCurrentDate}
                onConfirm={handleConfirmDate}
              />
            )
          }
          {
            ![ViewType.Date, ViewType.Time].includes(view) && (
              <YearAndMonthPickerFooter
                onYearMonthCancel={handleYearMonthCancel}
                onYearMonthConfirm={handleYearMonthConfirm}
              />
            )
          }
        </div>
      </PortalToFollowElemContent>
    </PortalToFollowElem>
  )
}

export default DatePicker
