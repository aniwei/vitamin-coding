
import { isMac } from './is'

const specialKeysName: Record<string, string | undefined> = {
  ctrl: '⌘',
  alt: '⌥',
  shift: '⇧',
}

export const getKeyboardKeyNameBySystem = (key: string) => {
  if (isMac())
    return specialKeysName[key] || key

  return key
}

const specialKeysCode: Record<string, string | undefined> = {
  ctrl: 'meta',
}

export const getKeyboardKeyCodeBySystem = (key: string) => {
  if (isMac())
    return specialKeysCode[key] || key

  return key
}