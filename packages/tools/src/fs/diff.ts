import { diffLines } from 'diff'

interface DiffResult {
  content: string
  firstChangedLine: number | undefined
}

interface DiffPart {
  added?: boolean
  removed?: boolean
  value: string
}

export function diff(oldContent: string, newContent: string, contextLines = 4): DiffResult {
  const parts = diffLines(oldContent, newContent) as DiffPart[]
  const output: string[] = []

  const oldLines = oldContent.split('\n')
  const newLines = newContent.split('\n')
  const maxLine = Math.max(oldLines.length, newLines.length)
  const lineWidth = String(maxLine).length

  let oldLine = 1
  let newLine = 1
  let lastWasChange = false
  let firstChangedLine: number | undefined

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i] as DiffPart
    const raw = part.value.split('\n')

    if (raw[raw.length - 1] === '') {
      raw.pop()
    }

    if (part.added || part.removed) {
      if (firstChangedLine === undefined) {
        firstChangedLine = newLine
      }

      for (const line of raw) {
        if (part.added) {
          const lineNum = String(newLine).padStart(lineWidth, ' ')
          output.push(`+${lineNum} ${line}`)
          newLine++
        } else {
          const lineNum = String(oldLine).padStart(lineWidth, ' ')
          output.push(`-${lineNum} ${line}`)
          oldLine++
        }
      }
      lastWasChange = true
    } else {
      const nextPart = parts[i + 1] as DiffPart
      const nextPartIsChange = i < parts.length - 1 && (nextPart.added || nextPart.removed)

      if (lastWasChange || nextPartIsChange) {
        let linesToShow = raw
        let skipStart = 0
        let skipEnd = 0

        if (!lastWasChange) {
          skipStart = Math.max(0, raw.length - contextLines)
          linesToShow = raw.slice(skipStart)
        }

        if (!nextPartIsChange && linesToShow.length > contextLines) {
          skipEnd = linesToShow.length - contextLines
          linesToShow = linesToShow.slice(0, contextLines)
        }

        if (skipStart > 0) {
          output.push(` ${''.padStart(lineWidth, ' ')} ...`)
          oldLine += skipStart
          newLine += skipStart
        }

        for (const line of linesToShow) {
          const lineNum = String(oldLine).padStart(lineWidth, ' ')
          output.push(` ${lineNum} ${line}`)
          oldLine++
          newLine++
        }

        if (skipEnd > 0) {
          output.push(` ${''.padStart(lineWidth, ' ')} ...`)
          oldLine += skipEnd
          newLine += skipEnd
        }
      } else {
        oldLine += raw.length
        newLine += raw.length
      }

      lastWasChange = false
    }
  }

  return {
    content: output.join('\n'),
    firstChangedLine,
  }
}
