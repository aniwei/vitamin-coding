import { createContext, useContext } from 'use-context-selector'
import { hexToRGBA } from '@/shared/css'

export class ChatTheme {
  public colorTheme: string | null
  public colorThemeInverted: boolean

  public primaryColor = '#1C64F2'
  public backgroundHeaderColorStyle = 'backgroundImage: linear-gradient(to right, #2563eb, #0ea5e9)'
  public headerBorderBottomStyle = ''
  public colorFontOnHeaderStyle = 'color: white'
  public colorPathOnHeader = 'text-text-primary-on-surface'
  public backgroundButtonDefaultColorStyle = 'backgroundColor: #1C64F2'
  public roundedBackgroundColorStyle = 'backgroundColor: rgb(245 248 255)'
  public chatBubbleColorStyle = ''

  constructor(colorTheme: string | null = null, colorThemeInverted = false) {
    this.colorTheme = colorTheme
    this.colorThemeInverted = colorThemeInverted
    this.configCustomColor()
    this.configInvertedColor()
  }

  private configCustomColor() {
    if (this.colorTheme !== null && this.colorTheme !== '') {
      this.primaryColor = this.colorTheme ?? '#1C64F2'
      this.backgroundHeaderColorStyle = `backgroundColor: ${this.primaryColor}`
      this.backgroundButtonDefaultColorStyle = `backgroundColor: ${this.primaryColor}; color: ${this.colorFontOnHeaderStyle};`
      this.roundedBackgroundColorStyle = `backgroundColor: ${hexToRGBA(this.primaryColor, 0.05)}`
      this.chatBubbleColorStyle = `backgroundColor: ${hexToRGBA(this.primaryColor, 0.15)}`
    }
  }

  private configInvertedColor() {
    if (this.colorThemeInverted) {
      this.backgroundHeaderColorStyle = 'backgroundColor: #ffffff'
      this.colorFontOnHeaderStyle = `color: ${this.primaryColor}`
      this.headerBorderBottomStyle = 'borderBottom: 1px solid #ccc'
      this.colorPathOnHeader = this.primaryColor
    }
  }
}

export class ChatThemeBuilder {
  private chatTheme?: ChatTheme
  private buildChecker = false
  
  public get theme() {
    if (this.chatTheme === undefined) {
      this.chatTheme = new ChatTheme()
    } 

    return this.chatTheme
  }

  public buildTheme(colorTheme: string | null = null, colorThemeInverted = false) {
    if (!this.buildChecker) {
      this.chatTheme = new ChatTheme(colorTheme, colorThemeInverted)
      this.buildChecker = true
    } else {
      if (
        this.chatTheme?.colorTheme !== colorTheme || 
        this.chatTheme?.colorThemeInverted !== colorThemeInverted
      ) {
        this.chatTheme = new ChatTheme(colorTheme, colorThemeInverted)
        this.buildChecker = true
      }
    }
  }
}

const ThemeContext = createContext<ChatThemeBuilder>(new ChatThemeBuilder())
export const useThemeContext = () => useContext(ThemeContext)
