import { Eye } from 'lucide-react'
import { useState, type ComponentProps, type ReactNode, type Ref } from 'react'
import eyeHiddenIcon from '@/assets/icons/eye-hidden.svg'
import { Icon } from '@/shared/ui/Icon'
import { cn } from '@/lib/utils'

/**
 * `dialog`: desktop auth modal (40px, 5px radius).
 * `page`: mobile auth page (50px, 10px).
 * `account`: profile/wallets screens (40px, 3px radius — Figma Perfil/Carteiras).
 */
export type FieldVariant = 'dialog' | 'page' | 'account'

const boxClass: Record<FieldVariant, string> = {
  dialog: 'h-10 rounded-[5px]',
  page: 'h-[50px] rounded-[10px]',
  account: 'h-10 rounded-[3px]',
}

const frameClass =
  'flex w-full items-center border border-border-field bg-transparent px-4 transition-colors focus-within:border-brand focus-within:ring-2 focus-within:ring-ring/40 has-[[aria-invalid=true]]:border-coral'

const inputClass =
  'h-full w-full min-w-0 bg-transparent text-body-14 leading-4 text-cream outline-none placeholder:text-sand'

interface FieldProps extends Omit<ComponentProps<'input'>, 'className'> {
  id: string
  /** Accessible name. Auth screens hide it (`sr-only`); account screens also show `FieldLabel`. */
  label: string
  variant: FieldVariant
  error?: string
  inputRef?: Ref<HTMLInputElement>
  inputClassName?: string
  /** Hide the built-in sr-only label when a visible `FieldLabel` already names the control. */
  hideSrLabel?: boolean
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null
  return (
    <p id={id} className="mt-1.5 text-caption-12 text-coral">
      {message}
    </p>
  )
}

/** Visible label + optional coral asterisk (Figma Perfil / Carteiras). */
export function FieldLabel({
  htmlFor,
  required,
  children,
}: {
  htmlFor?: string
  required?: boolean
  children: ReactNode
}) {
  const content = (
    <span className="flex items-center gap-0.5">
      <span className="text-body-15 leading-[15px] text-cream">{children}</span>
      {required ? (
        <span aria-hidden className="text-[22px] leading-[29px] text-coral">
          *
        </span>
      ) : null}
    </span>
  )
  if (!htmlFor) return content
  return (
    <label htmlFor={htmlFor} className="block">
      {content}
    </label>
  )
}

export function TextField({
  id,
  label,
  variant,
  error,
  inputRef,
  inputClassName,
  hideSrLabel,
  ...input
}: FieldProps) {
  const errorId = `${id}-error`
  return (
    <div>
      {hideSrLabel ? null : (
        <label htmlFor={id} className="sr-only">
          {label}
        </label>
      )}
      <div className={cn(frameClass, boxClass[variant])}>
        <input
          id={id}
          ref={inputRef}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className={cn(inputClass, inputClassName)}
          {...input}
        />
      </div>
      <FieldError id={errorId} message={error} />
    </div>
  )
}

export function PasswordField({
  id,
  label,
  toggleLabel,
  variant,
  error,
  inputRef,
  hideSrLabel,
  ...input
}: Omit<FieldProps, 'type'> & { toggleLabel: string }) {
  const [visible, setVisible] = useState(false)
  const errorId = `${id}-error`
  return (
    <div>
      {hideSrLabel ? null : (
        <label htmlFor={id} className="sr-only">
          {label}
        </label>
      )}
      <div className={cn(frameClass, boxClass[variant], 'gap-2 pr-3')}>
        <input
          id={id}
          ref={inputRef}
          type={visible ? 'text' : 'password'}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className={cn(inputClass, !visible && input.value ? 'text-body-16' : undefined)}
          {...input}
        />
        <button
          type="button"
          aria-label={toggleLabel}
          aria-pressed={visible}
          aria-controls={id}
          onClick={() => setVisible((current) => !current)}
          className="flex size-7 shrink-0 items-center justify-center rounded-[4px] text-sand outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {visible ? (
            <Eye aria-hidden className="size-5" strokeWidth={1.5} />
          ) : (
            <img src={eyeHiddenIcon} alt="" aria-hidden className="h-5 w-[23px]" />
          )}
        </button>
      </div>
      <FieldError id={errorId} message={error} />
    </div>
  )
}

/**
 * Account text field: visible label + 40×3px input (shared by Perfil and Carteiras).
 * When `label` differs from `visibleLabel` (e2e-friendly name), the visible label is
 * decorative and the accessible name comes from the sr-only control label.
 */
export function AccountTextField({
  id,
  visibleLabel,
  label,
  required,
  error,
  inputRef,
  ...input
}: Omit<FieldProps, 'variant' | 'hideSrLabel'> & {
  visibleLabel: string
  required?: boolean
}) {
  const sameName = label === visibleLabel
  return (
    <div className="flex flex-col gap-2.5">
      {sameName ? (
        <FieldLabel htmlFor={id} required={required}>
          {visibleLabel}
        </FieldLabel>
      ) : (
        <span aria-hidden>
          <FieldLabel required={required}>{visibleLabel}</FieldLabel>
        </span>
      )}
      <TextField
        id={id}
        label={label}
        variant="account"
        error={error}
        inputRef={inputRef}
        hideSrLabel={sameName}
        {...input}
      />
    </div>
  )
}

/** Read-only value rendered with the same chrome as an account input. */
export function AccountReadOnlyField({
  label,
  required,
  value,
}: {
  label: string
  required?: boolean
  value: string
}) {
  return (
    <div className="flex flex-col gap-2.5">
      <FieldLabel required={required}>{label}</FieldLabel>
      <div
        className="flex h-10 w-full items-center rounded-[3px] border border-border-field bg-transparent px-4 text-body-14 text-cream"
        aria-readonly="true"
      >
        {value}
      </div>
    </div>
  )
}

/** Select with the same label/input chrome as account text fields. */
export function AccountSelectField({
  id,
  visibleLabel,
  label,
  required,
  value,
  error,
  onChange,
  options,
}: {
  id: string
  visibleLabel: string
  label: string
  required?: boolean
  value: string
  error?: string
  onChange: (value: string) => void
  options: { id: string; label: string }[]
}) {
  const errorId = `${id}-error`
  const sameName = label === visibleLabel
  return (
    <div className="flex flex-col gap-2.5">
      {sameName ? (
        <FieldLabel htmlFor={id} required={required}>
          {visibleLabel}
        </FieldLabel>
      ) : (
        <span aria-hidden>
          <FieldLabel required={required}>{visibleLabel}</FieldLabel>
        </span>
      )}
      {sameName ? null : (
        <label htmlFor={id} className="sr-only">
          {label}
        </label>
      )}
      <div className="relative">
        <select
          id={id}
          value={value}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          onChange={(event) => onChange(event.target.value)}
          className="h-10 w-full appearance-none rounded-[3px] border border-border-field bg-transparent px-3 pr-10 text-body-14 text-cream outline-none focus:border-brand focus:ring-2 focus:ring-ring/40"
        >
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
        <Icon
          name="arrow-down"
          className="pointer-events-none absolute top-1/2 right-2 size-5 -translate-y-1/2 text-cream"
        />
      </div>
      <FieldError id={errorId} message={error} />
    </div>
  )
}

/** ENS compound: `.eth` addon + text input (Figma Nome ENS). */
export function AccountEnsField({
  id,
  visibleLabel,
  label,
  required,
  value,
  error,
  placeholder,
  readOnly,
  onChange,
}: {
  id: string
  visibleLabel: string
  label: string
  required?: boolean
  value: string
  error?: string
  placeholder?: string
  readOnly?: boolean
  onChange?: (value: string) => void
}) {
  const sameName = label === visibleLabel
  return (
    <div className="flex flex-col gap-2.5">
      {readOnly || sameName ? (
        <FieldLabel htmlFor={readOnly ? undefined : id} required={required}>
          {visibleLabel}
        </FieldLabel>
      ) : (
        <span aria-hidden>
          <FieldLabel required={required}>{visibleLabel}</FieldLabel>
        </span>
      )}
      <div className="flex h-10 gap-2.5">
        <div className="flex w-[78px] shrink-0 items-center justify-between rounded-[3px] border border-border-field px-2.5 text-body-15 text-cream">
          .eth
          <Icon name="arrow-down" className="size-5 text-cream" />
        </div>
        {readOnly ? (
          <div
            className="flex min-w-0 flex-1 items-center rounded-[3px] border border-border-field px-4 text-body-14 text-cream"
            aria-readonly="true"
          >
            {value || '—'}
          </div>
        ) : (
          <div className="min-w-0 flex-1">
            <TextField
              id={id}
              label={label}
              variant="account"
              value={value}
              error={error}
              placeholder={placeholder}
              hideSrLabel={sameName}
              onChange={(event) => onChange?.(event.target.value)}
            />
          </div>
        )}
      </div>
    </div>
  )
}

/** Form-level error (wrong credentials, conflict, unavailable API). */
export function FormAlert({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <p role="alert" className="rounded-[5px] border border-coral/60 px-3 py-2 text-caption-13 text-coral">
      {message}
    </p>
  )
}
