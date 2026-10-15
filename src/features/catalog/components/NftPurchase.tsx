import { useId } from 'react'
import type { Edition, NftDetail } from '@/contracts/catalog'
import { formatEthDisplay } from '@/lib/eth'
import { cn } from '@/lib/utils'
import { Icon } from '@/shared/ui/Icon'

export function EditionPicker({
  nft,
  selected,
  onSelect,
}: {
  nft: NftDetail
  selected: Edition
  onSelect: (edition: Edition) => void
}) {
  const labelId = useId()
  return (
    <div className="flex flex-col gap-2">
      <p id={labelId} className="text-body-15 font-bold text-cream">
        Edição:
      </p>
      <div role="radiogroup" aria-labelledby={labelId} className="flex flex-wrap gap-2">
        {nft.editions.map((edition) => {
          const soldOut = edition.available === 0
          const checked = edition.id === selected.id
          return (
            <label
              key={edition.id}
              className={cn(
                'flex h-7 cursor-pointer items-center rounded-full border px-3 text-body-14 uppercase has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring',
                checked ? 'border-brand font-medium text-brand-accent' : 'border-border-field text-text-secondary',
                soldOut && 'cursor-not-allowed line-through opacity-60',
              )}
            >
              <input
                type="radio"
                name={`edition-${nft.id}`}
                value={edition.id}
                checked={checked}
                disabled={soldOut}
                onChange={() => onSelect(edition)}
                className="sr-only"
              />
              {edition.name}
              <span className="sr-only">
                {soldOut ? ', esgotada' : `, ${formatEthDisplay(edition.priceEth)} ETH, ${edition.available} disponíveis`}
              </span>
            </label>
          )
        })}
      </div>
    </div>
  )
}

export function QuantityStepper({
  value,
  max,
  onChange,
  size = 'large',
}: {
  value: number
  max: number
  onChange: (value: number) => void
  size?: 'large' | 'small'
}) {
  const buttonClass = cn(
    'flex items-center justify-center rounded-full bg-brand text-ink shadow-card outline-none hover:bg-brand-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-ink disabled:opacity-40',
    size === 'large' ? 'h-[50px] w-[33px]' : 'h-[30px] w-5',
  )
  return (
    <div role="group" aria-label="Quantidade" className="flex items-center gap-3">
      <button
        type="button"
        aria-label="Diminuir quantidade"
        disabled={value <= 1}
        onClick={() => onChange(value - 1)}
        className={buttonClass}
      >
        <Icon name="minus" className={size === 'large' ? 'size-4' : 'size-3'} />
      </button>
      <output aria-live="polite" aria-label="Quantidade selecionada" className="min-w-6 text-center text-title-20 text-cream">
        {value}
      </output>
      <button
        type="button"
        aria-label="Aumentar quantidade"
        disabled={value >= max}
        onClick={() => onChange(value + 1)}
        className={buttonClass}
      >
        <Icon name="plus" className={size === 'large' ? 'size-4' : 'size-3'} />
      </button>
    </div>
  )
}
