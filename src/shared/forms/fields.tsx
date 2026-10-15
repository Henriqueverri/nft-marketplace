import { Eye } from 'lucide-react'
import { useState, type ComponentProps, type Ref } from 'react'
import eyeHiddenIcon from '@/assets/icons/eye-hidden.svg'
import { cn } from '@/lib/utils'

/** `dialog`: desktop modal (40px fields, 5px radius). `page`: mobile page (50px, 10px). */
export type FieldVariant = 'dialog' | 'page'

const boxClass: Record<FieldVariant, string> = {
  dialog: 'h-10 rounded-[5px]',
  page: 'h-[50px] rounded-[10px]',
}

const frameClass =
  'flex w-full items-center border border-border-field bg-transparent px-4 transition-colors focus-within:border-brand focus-within:ring-2 focus-within:ring-ring/40 has-[[aria-invalid=true]]:border-coral'

const inputClass =
  'h-full w-full min-w-0 bg-transparent text-body-14 leading-4 text-cream outline-none placeholder:text-sand'

interface FieldProps extends Omit<ComponentProps<'input'>, 'className'> {
  id: string
  /** Accessible name. The Figma shows placeholders only, so the label is visually hidden. */
  label: string
  variant: FieldVariant
  error?: string
  inputRef?: Ref<HTMLInputElement>
  inputClassName?: string
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null
  return (
    <p id={id} className="mt-1.5 text-caption-12 text-coral">
      {message}
    </p>
  )
}

export function TextField({ id, label, variant, error, inputRef, inputClassName, ...input }: FieldProps) {
  const errorId = `${id}-error`
  return (
    <div>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
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
  ...input
}: Omit<FieldProps, 'type'> & { toggleLabel: string }) {
  const [visible, setVisible] = useState(false)
  const errorId = `${id}-error`
  return (
    <div>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
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

/** Form-level error (wrong credentials, conflict, unavailable API). */
export function FormAlert({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <p role="alert" className="rounded-[5px] border border-coral/60 px-3 py-2 text-caption-13 text-coral">
      {message}
    </p>
  )
}
