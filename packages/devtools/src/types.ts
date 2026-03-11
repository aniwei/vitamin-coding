import { type TypedEventEmitter } from '@vitamin/shared'

export interface DevtoolServiceEvents {
  event: (event: any) => void,
  [key: string]: (...args: never[]) => void
}

export interface DevtoolsEvents extends DevtoolServiceEvents {
  'Debugger.paused': (...args: unknown[]) => void
  'Debugger.stepOver': (...args: unknown[]) => void
  [key: string]: (...args: unknown[]) => void
}

export interface Devtools extends TypedEventEmitter<DevtoolsEvents> {

}