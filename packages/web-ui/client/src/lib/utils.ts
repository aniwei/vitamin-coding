import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const fetcher = async (url: string, options?: RequestInit) => {
  const res = await fetch(url, {
    redirect: "follow",
    cache: "no-store",
    ...options,
  });

  if (!res.ok) {
    let errorPayload: { message?: string } = {};
    try {
      errorPayload = await res.json();
    } catch {
      errorPayload = { message: `Request failed with status ${res.status}` };
    }
    const error = new Error(
      errorPayload.message || "An error occurred while fetching the data.",
    );
    Object.assign(error, { info: errorPayload, status: res.status });
    throw error;
  }

  return res.json();
};

export const createIncrement =
  (i = 0) =>
  () =>
    i++;

export const noop = () => {};

export function generateUUID(): string {
  return crypto.randomUUID();
}

export const isString = (value: unknown): value is string =>
  typeof value === 'string'

export const isFunction = <
  T extends (...args: unknown[]) => unknown = (...args: unknown[]) => unknown,
>(
  v: unknown,
): v is T => typeof v === 'function'

export const isObject = (value: unknown): value is Record<string, unknown> =>
  Object(value) === value

export const isNull = (value: unknown): value is null | undefined =>
  value == null

export const isPromiseLike = (x: unknown): x is PromiseLike<unknown> =>
  isFunction((x as Record<string, unknown>)?.then)

export const groupBy = <T>(arr: T[], getter: keyof T | ((item: T) => string)) =>
  arr.reduce(
    (prev, item) => {
      const key: string =
        getter instanceof Function ? getter(item) : (item[getter] as string)
      if (!prev[key]) prev[key] = []
      prev[key].push(item)
      return prev
    },
    {} as Record<string, T[]>,
  )

export function deduplicateByKey<T>(arr: T[], key: keyof T): T[] {
  const seen = new Set<T[keyof T]>()
  return arr.filter((item) => {
    const keyValue = item[key]
    if (seen.has(keyValue)) return false
    seen.add(keyValue)
    return true
  })
}

export function errorToString(error: unknown) {
  if (error == null) return 'unknown error'
  if (typeof error === 'string') return error
  if (error instanceof Error) return error.message
  return JSON.stringify(error)
}

export function objectFlow<T extends Record<string, unknown>>(obj: T) {
  return {
    map: <R>(fn: (value: T[keyof T], key: keyof T) => R): Record<keyof T, R> => {
      return Object.fromEntries(
        Object.entries(obj).map(([key, value]) => [
          key,
          fn(value as T[keyof T], key as keyof T),
        ]),
      ) as Record<keyof T, R>
    },
    filter: (
      fn: (value: T[keyof T], key: keyof T) => boolean,
    ): Record<keyof T, T[keyof T]> => {
      return Object.fromEntries(
        Object.entries(obj).filter(([key, value]) =>
          fn(value as T[keyof T], key as keyof T),
        ),
      ) as Record<keyof T, T[keyof T]>
    },
    forEach: (fn: (value: T[keyof T], key: keyof T) => void): void => {
      Object.entries(obj).forEach(([key, value]) =>
        fn(value as T[keyof T], key as keyof T),
      )
    },
    some: (fn: (value: T[keyof T], key: keyof T) => unknown): boolean => {
      return Object.entries(obj).some(([key, value]) =>
        fn(value as T[keyof T], key as keyof T),
      )
    },
    every: (fn: (value: T[keyof T], key: keyof T) => unknown): boolean => {
      return Object.entries(obj).every(([key, value]) =>
        fn(value as T[keyof T], key as keyof T),
      )
    },
  }
}

export async function nextTick() {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

export const createEmitter = () => {
  const listeners = new Set<(value: string) => void>()
  return {
    on: (listener: (value: string) => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    off: (listener: (value: string) => void) => listeners.delete(listener),
    emit: (value: string) => listeners.forEach((l) => l(value)),
  }
}

export function capitalizeFirstLetter(str: string): string {
  if (!str || str.length === 0) return str
  return str.charAt(0).toUpperCase() + str.slice(1)
}

export function truncateString(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value
  return `${value.slice(0, maxLength)}...`
}

export function safeJSONParse<T = unknown>(
  json: string,
): { success: true; value: T } | { success: false; error: unknown } {
  try {
    return { success: true, value: JSON.parse(json) as T }
  } catch (e) {
    return { success: false, error: e }
  }
}
