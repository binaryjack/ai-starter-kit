import { useId } from 'react'
import { useForm } from './FormProvider.js'
import { useFormularField } from './useFormularField.js'

interface CheckBoxProps {
  name:      string
  label?:    string
  disabled?: boolean
  className?: string
}

export function CheckBox({
  name,
  label,
  disabled  = false,
  className = '',
}: CheckBoxProps) {
  const form  = useForm()
  const field = useFormularField<boolean>(form, name)
  const id    = useId()

  const hasError = field.errors.length > 0

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <label
        htmlFor={id}
        className={[
          'flex items-center gap-2 text-sm cursor-pointer select-none',
          'text-neutral-700 dark:text-neutral-300',
          disabled ? 'opacity-50 cursor-not-allowed' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <input
          id={id}
          type="checkbox"
          name={name}
          checked={!!(field.value)}
          disabled={disabled}
          onChange={(e) => {
            form.updateField(name, e.target.checked)
          }}
          aria-invalid={hasError}
          aria-describedby={hasError ? `${id}-error` : undefined}
          className={[
            'h-4 w-4 rounded border accent-brand-500',
            'focus:ring-2 focus:ring-brand-500 focus:ring-offset-1',
            hasError ? 'border-danger-500' : 'border-neutral-300 dark:border-neutral-600',
          ]
            .filter(Boolean)
            .join(' ')}
        />
        {label}
      </label>
      {hasError && (
        <ul id={`${id}-error`}>
          {field.errors.map((err, i) => (
            <li
              key={i}
              role="alert"
              className="text-xs text-danger-700 dark:text-danger-500 ml-6"
            >
              {err.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
