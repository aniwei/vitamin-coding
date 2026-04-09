type Side = 'top' | 'bottom' | 'left' | 'right'
type Align = 'start' | 'center' | 'end'

export type Placement
  = 'top'
    | 'top-start'
    | 'top-end'
    | 'right'
    | 'right-start'
    | 'right-end'
    | 'bottom'
    | 'bottom-start'
    | 'bottom-end'
    | 'left'
    | 'left-start'
    | 'left-end'

export interface ParsedPlacement {
  side: Side
  align: Align
}

export function parsePlacement(placement: Placement): ParsedPlacement {
  const [side, align] = placement.split('-') as [Side, Align | undefined]

  return {
    side,
    align: align ?? 'center',
  }
}
