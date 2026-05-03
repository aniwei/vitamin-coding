import type { SchedulerSchedule } from './types'

const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

export function parseScheduleExpression(expression: string): SchedulerSchedule {
  const normalized = expression.trim().toLowerCase()
  if (!normalized) {
    throw new Error('schedule expression is required')
  }

  const interval = parseInterval(normalized)
  if (interval) {
    return { expression, kind: 'interval', everyMs: interval }
  }

  if (normalized === '@hourly') {
    return { expression, kind: 'cron' }
  }
  if (normalized === '@daily') {
    return { expression, kind: 'cron' }
  }

  const parts = normalized.split(/\s+/)
  const minute = parts[0]
  const hour = parts[1]
  if (
    parts.length === 5 &&
    minute !== undefined &&
    hour !== undefined &&
    parseCronField(minute, 0, 59) &&
    parseCronField(hour, 0, 23)
  ) {
    return { expression, kind: 'cron' }
  }

  throw new Error(`Unsupported schedule expression: ${expression}`)
}

export function computeNextRunAt(schedule: SchedulerSchedule, from: number): number {
  if (schedule.kind === 'interval') {
    return from + (schedule.everyMs ?? 0)
  }

  const normalized = schedule.expression.trim().toLowerCase()
  if (normalized === '@hourly') {
    return nextCronRunAt(['0', '*', '*', '*', '*'], from)
  }
  if (normalized === '@daily') {
    return nextCronRunAt(['0', '0', '*', '*', '*'], from)
  }
  return nextCronRunAt(normalized.split(/\s+/), from)
}

function parseInterval(expression: string): number | undefined {
  const match =
    /^every\s+(\d+)\s*(s|sec|secs|second|seconds|m|min|mins|minute|minutes|h|hour|hours|d|day|days)$/.exec(
      expression,
    )
  if (!match) {
    return undefined
  }

  const value = Number(match[1])
  const unit = match[2] ?? ''
  if (!Number.isFinite(value) || value <= 0) {
    return undefined
  }

  if (unit.startsWith('s')) {
    return value * 1000
  }
  if (unit.startsWith('m')) {
    return value * MINUTE_MS
  }
  if (unit.startsWith('h')) {
    return value * HOUR_MS
  }
  return value * DAY_MS
}

function nextCronRunAt(parts: string[], from: number): number {
  const minutes = parseCronField(parts[0] ?? '*', 0, 59)
  const hours = parseCronField(parts[1] ?? '*', 0, 23)
  if (!minutes || !hours) {
    throw new Error(`Unsupported cron expression: ${parts.join(' ')}`)
  }

  const cursor = new Date(from + MINUTE_MS)
  cursor.setSeconds(0, 0)

  for (let i = 0; i < 366 * 24 * 60; i++) {
    if (minutes.has(cursor.getMinutes()) && hours.has(cursor.getHours())) {
      return cursor.getTime()
    }
    cursor.setTime(cursor.getTime() + MINUTE_MS)
  }

  throw new Error(`Could not compute next run for cron expression: ${parts.join(' ')}`)
}

function parseCronField(field: string, min: number, max: number): Set<number> | undefined {
  if (field === '*') {
    return range(min, max)
  }

  const step = /^\*\/(\d+)$/.exec(field)
  if (step) {
    const value = Number(step[1])
    if (!Number.isInteger(value) || value <= 0) {
      return undefined
    }
    const values = new Set<number>()
    for (let current = min; current <= max; current += value) {
      values.add(current)
    }
    return values
  }

  const exact = Number(field)
  if (Number.isInteger(exact) && exact >= min && exact <= max) {
    return new Set([exact])
  }

  return undefined
}

function range(min: number, max: number): Set<number> {
  const values = new Set<number>()
  for (let value = min; value <= max; value++) {
    values.add(value)
  }
  return values
}
