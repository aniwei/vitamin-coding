import { NoteTheme } from '@/components/workflow/types'

export const ITERATION_CHILDREN_Z_INDEX = 1002
export const CUSTOM_NODE = 'custom'
export const CUSTOM_EDGE = 'custom'
export const CUSTOM_ITERATION_START_NODE = 'custom-iteration-start'
export const CUSTOM_LOOP_START_NODE = 'custom-loop-start'
export const CUSTOM_NOTE_NODE = 'custom-note'
export const CUSTOM_SIMPLE_NODE = 'custom-simple'


type ThemeShape = {
  outer: string
  title: string
  background: string
  border: string
}

const theme: Record<string, ThemeShape> = {
  [NoteTheme.Blue]: {
    outer: 'border-util-colors-blue-blue-500',
    title: 'bg-util-colors-blue-blue-100',
    background: 'bg-util-colors-blue-blue-50',
    border: 'border-util-colors-blue-blue-300',
  },
  [NoteTheme.Cyan]: {
    outer: 'border-util-colors-cyan-cyan-500',
    title: 'bg-util-colors-cyan-cyan-100',
    background: 'bg-util-colors-cyan-cyan-50',
    border: 'border-util-colors-cyan-cyan-300',
  },
  [NoteTheme.Green]: {
    outer: 'border-util-colors-green-green-500',
    title: 'bg-util-colors-green-green-100',
    background: 'bg-util-colors-green-green-50',
    border: 'border-util-colors-green-green-300',
  },
  [NoteTheme.Yellow]: {
    outer: 'border-util-colors-yellow-yellow-500',
    title: 'bg-util-colors-yellow-yellow-100',
    background: 'bg-util-colors-yellow-yellow-50',
    border: 'border-util-colors-yellow-yellow-300',
  },
  [NoteTheme.Pink]: {
    outer: 'border-util-colors-pink-pink-500',
    title: 'bg-util-colors-pink-pink-100',
    background: 'bg-util-colors-pink-pink-50',
    border: 'border-util-colors-pink-pink-300',
  },
  [NoteTheme.Violet]: {
    outer: 'border-util-colors-violet-violet-500',
    title: 'bg-util-colors-violet-violet-100',
    background: 'bg-util-colors-violet-violet-100',
    border: 'border-util-colors-violet-violet-300',
  },
}

export const getNoteTheme = (themeName: NoteTheme) => {
  return theme[themeName]
}