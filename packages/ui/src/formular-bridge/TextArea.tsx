import { useId } from 'react'
import { useForm } from './FormProvider.js'
import { useFormularField } from './useFormularField.js'

interface TextAreaProps {
  name:        string
  label?:      string
  rows?:       number
  placeholder?: string
  disabled?:   boolean
  className?:  string
}

export function TextArea({
  name,
  label,
  rows      = 4,
  placeholder,
  disabled  = false,
  className = '',
}: TextAreaProps) {
  const form  = useForm()
  const field = useFormularField<string>(form, name)
  const id    = useId()

  const hasError = field.errors.length > 0

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      {label && (
        <label
          htmlFor={id}
          className="text-sm font-medium text-neutral-700 dark:text-neutral-300"
        >
          {label}
        </label>
      )}
      <textarea
        id={id}
        name={name}
        rows={rows}
        value={(field.value as string | undefined) ?? ''}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => form.updateField(name, e.target.value)}
        onBlur={() => void form.validate(name)}
        aria-invalid={hasError}
        aria-describedby={hasError ? `${id}-error` : undefined}
        className={[
          'rounded-node border px-3 py-1.5 text-sm bg-white dark:bg-neutral-800',
          'text-neutral-900 dark:text-neutral-100 resize-y',
          'outline-none transition-colors font-mono',
          'focus:ring-2 focus:ring-brand-500 focus:border-brand-500',
          hasError
            ? 'border-danger-500'
            : 'border-neutral-300 dark:border-neutral-600',
          disabled ? 'opacity-50 cursor-not-allowed' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      />
      {hasError && (
        <ul id={`${id}-error`}>
          {field.errors.map((err, i) => (
            <li
              key={i}
              role="alert"
              className="text-xs text-danger-700 dark:text-danger-500"
            >
              {err.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
