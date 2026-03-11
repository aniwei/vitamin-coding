const {
  setPrototypeOf = function (obj: unknown, proto: unknown) {
    ;(obj as any).__proto__ = proto
    return obj
  },
} = Object as any

export class InvariantError extends Error {
  framesToPop = 1
  override name = 'Invariant Violation'

  constructor(message: string | number = 'Invariant Violation') {
    super(typeof message === 'number' ? `Invariant Violation: ${message}` : message)
    setPrototypeOf(this, InvariantError.prototype)
  }
}

export function invariant(condition: any, message?: string | number): asserts condition {
  if (typeof condition === 'function') {
    invariant(condition(), message)
  } else if (!condition) {
    throw new InvariantError(message)
  }
}

const VERBOSITY_LEVELS = ['debug', 'log', 'warn', 'error', 'silent'] as const

export type VerbosityLevel = (typeof VERBOSITY_LEVELS)[number]
export type ConsoleFunctionName = Exclude<VerbosityLevel, 'silent'>

let verbosityLevel = VERBOSITY_LEVELS.indexOf('log')

function override<M extends ConsoleFunctionName>(name: M) {
  return function () {
    if (VERBOSITY_LEVELS.indexOf(name) >= verbosityLevel) {
      const fn = console[name] || console.log
      return fn.apply(console, arguments as any)
    }
  } as (typeof console)[M]
}

export namespace invariant {
  export const debug = override('debug')
  export const log = override('log')
  export const warn = override('warn')
  export const error = override('error')
}

export function setVerbosity(level: VerbosityLevel): VerbosityLevel {
  const origin = VERBOSITY_LEVELS[verbosityLevel] as VerbosityLevel
  verbosityLevel = Math.max(0, VERBOSITY_LEVELS.indexOf(level))
  return origin
}

export default invariant
