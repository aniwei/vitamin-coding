import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import Button from '@/components/button'
import { Brush01 } from '@/components/icons/solid/editor'
import { Scales02 } from '@/components/icons/solid/FinanceAndECommerce'
import { Target04 } from '@/components/icons/solid/general'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { TONE_LIST } from '@/config'

const toneI18nKeyMap = {
  Creative: 'model.tone.Creative',
  Balanced: 'model.tone.Balanced',
  Precise: 'model.tone.Precise',
  Custom: 'model.tone.Custom',
} as const

const TONE_ICONS: Record<number, ReactNode> = {
  1: <Brush01 className="mr-2 h-[14px] w-[14px] text-[#6938EF]" />,
  2: <Scales02 className="mr-2 h-[14px] w-[14px] text-indigo-600" />,
  3: <Target04 className="mr-2 h-[14px] w-[14px] text-[#107569]" />,
}

type PresetsParameterProps = {
  onSelect: (toneId: number) => void
}

function PresetsParameter({ onSelect }: PresetsParameterProps) {
  const { t } = useTranslation()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={(
          <Button
            size="small"
            variant="secondary"
            className="data-popup-open:bg-state-base-hover"
          />
        )}
      >
        {t('modelProvider.loadPresets', { ns: 'common' })}
        <span className="i-ri-arrow-down-s-line ml-0.5 h-3.5 w-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {TONE_LIST.slice(0, 3).map(tone => (
          <DropdownMenuItem key={tone.id} onClick={() => onSelect(tone.id)}>
            {TONE_ICONS[tone.id]}
            {t(toneI18nKeyMap[tone.name], { ns: 'common' })}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export default PresetsParameter
