
import Badge from '@/components/badge'
import Checkbox from '@/components/checkbox'
import SearchInput from '@/components/search-input'
import Button from '@/components/button'
import { useCallback, useMemo, useState } from 'react'
import { clsx } from 'clsx'

import SearchMenu from '@/assets/search-menu.svg'
import type { FC } from 'react'

interface CheckboxListOption {
  label: string
  value: string
  disabled?: boolean
}

interface CheckboxListProps {
  title?: string
  label?: string
  description?: string
  options: CheckboxListOption[]
  value?: string[]
  onChange?: (value: string[]) => void
  disabled?: boolean
  containerClassName?: string
  showSelectAll?: boolean
  showCount?: boolean
  showSearch?: boolean
  maxHeight?: string | number
}

export const CheckboxList: FC<CheckboxListProps> = ({
  title = '',
  label,
  description,
  options,
  value = [],
  onChange,
  disabled = false,
  containerClassName,
  showSelectAll = true,
  showCount = true,
  showSearch = true,
  maxHeight,
}) => {
  const [searchQuery, setSearchQuery] = useState('')

  const filteredOptions = useMemo(() => {
    if (!searchQuery?.trim()) {
      return options
    }

    const query = searchQuery.toLowerCase()

    return options.filter(option => 
      option.label.toLowerCase().includes(query) || 
      option.value.toLowerCase().includes(query)
    )
  }, [options, searchQuery])

  const selectedCount = value.length
  const isAllSelected = useMemo(() => {
    const selectableOptions = options.filter(option => !option.disabled)
    return selectableOptions.length > 0 && selectableOptions.every(option => value.includes(option.value))
  }, [options, value])

  const isIndeterminate = useMemo(() => {
    const selectableOptions = options.filter(option => !option.disabled)
    const selectedCount = selectableOptions.filter(option => value.includes(option.value)).length

    return selectedCount > 0 && selectedCount < selectableOptions.length
  }, [options, value])

  const handleSelectAll = useCallback(() => {
    if (disabled) {
      return
    }

    if (isAllSelected) {
      onChange?.([])
    } else {
      const allValues = options
        .filter(option => !option.disabled)
        .map(option => option.value)

      onChange?.(allValues)
    }
  }, [isAllSelected, options, onChange, disabled])

  const handleToggleOption = useCallback((optionValue: string) => {
    if (disabled) {
      return
    }

    const newValue = value.includes(optionValue)
      ? value.filter(v => v !== optionValue)
      : [...value, optionValue]
    onChange?.(newValue)
  }, [value, onChange, disabled])

  return (
    <div 
      className={clsx(
        'flex w-full flex-col gap-1', 
        containerClassName
      )}
    >
      {
        label && <div className="text-text-secondary system-sm-medium">
          {label}
        </div>
      }

      {
        description && <div className="text-text-tertiary body-xs-regular">
          {description}
        </div>
      }

      <div className="rounded-lg border border-components-panel-border bg-components-panel-bg">
        {(showSelectAll || title || showSearch) && (
          <div className="relative flex items-center gap-2 border-b border-divider-subtle px-3 py-2">
            {
              !searchQuery && showSelectAll && <Checkbox
                checked={isAllSelected}
                indeterminate={isIndeterminate}
                onCheck={handleSelectAll}
                disabled={disabled}
                id="selectAll"
              />
            }
            {!searchQuery
              ? <div className="flex min-w-0 flex-1 items-center gap-1">
                {
                  title && <span className="truncate leading-5 text-text-secondary system-xs-semibold-uppercase">
                    {title}
                  </span>
                }
                {
                  showCount && selectedCount > 0 && <Badge uppercase>
                    {selectedCount}
                  </Badge>
                }
              </div>
              : <div className="flex-1 leading-6 text-text-secondary system-sm-medium-uppercase">
                {
                  filteredOptions.length > 0
                    ? ''
                    : ''
                }
              </div>
              }
            {
              showSearch && <SearchInput
                value={searchQuery}
                onChange={setSearchQuery}
                placeholder="Search..."
                className="w-40"
              />
            }
          </div>
        )}

        <div
          className="p-1"
          style={maxHeight ? { maxHeight, overflowY: 'auto' } : {}}
          data-testid="options-container"
        >
          {
            !filteredOptions.length
              ? <div className="px-3 py-6 text-center text-sm text-text-tertiary">
                  {
                    searchQuery
                      ? <div className="flex flex-col items-center justify-center gap-2">
                          <img alt="search menu" src={SearchMenu.src} width={32} />
                          <span className="text-text-secondary system-sm-regular">{t('operation.noSearchResults', { ns: 'common', content: title })}</span>
                          <Button variant="secondary-accent" size="small" onClick={() => setSearchQuery('')}>Reset</Button>
                      </div>
                      : 'No options available'
                  }
                </div>
              : filteredOptions.map((option) => {
                const selected = value.includes(option.value)

                return (
                  <div
                    key={option.value}
                    data-testid="option-item"
                    className={clsx(
                      'flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-state-base-hover',
                      option.disabled && 'cursor-not-allowed opacity-50',
                    )}
                    onClick={() => {
                      if (!option.disabled && !disabled) {
                        handleToggleOption(option.value)
                      }
                    }}
                  >
                    <Checkbox
                      checked={selected}
                      onCheck={() => {
                        if (!option.disabled && !disabled) {
                          handleToggleOption(option.value)
                        }
                      }}
                      disabled={option.disabled || disabled}
                      id={option.value}
                    />
                    <div
                      className="flex-1 truncate text-text-secondary system-sm-medium"
                      title={option.label}
                    >{option.label}</div>
                  </div>
                )
              })
            }
        </div>
      </div>
    </div>
  )
}

export default CheckboxList
