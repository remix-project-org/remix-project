import React, { forwardRef, useImperativeHandle, useRef, useEffect } from 'react'
import './otp-digit-input.css'

export interface OtpDigitInputHandle {
  /** Move keyboard focus to the first digit cell. */
  focus: () => void
  /** Clear all digits and refocus the first cell. */
  reset: () => void
}

export interface OtpDigitInputProps {
  /** Current code as an array of single-character strings. Must have length === `length`. */
  value: string[]
  /** Called whenever the digit array changes. */
  onChange: (digits: string[]) => void
  /** Called when all digits are filled (user typed the last cell or pasted a complete code). */
  onComplete?: (code: string) => void
  /** Called when the user presses Enter inside any cell. */
  onSubmit?: () => void
  /** Disable all inputs (e.g. while verifying). */
  disabled?: boolean
  /** Number of digits. Defaults to 6. */
  length?: number
  /** Auto-focus the first cell on mount. Defaults to true. */
  autoFocus?: boolean
  /** Optional class name applied to the wrapping group. */
  className?: string
  /** Optional class name applied to each digit input. */
  digitClassName?: string
}

/**
 * Reusable 6-digit (or N-digit) one-time-code input.
 *
 * Handles:
 *  • per-cell numeric-only entry with auto-advance
 *  • Backspace navigation across cells
 *  • Paste of the full code into any cell
 *  • Enter to submit
 *  • Auto-fire onComplete when the last cell is filled
 *
 * Visual styling reuses the existing `login-modal-otp-*` CSS classes by default
 * (imported once via login-modal.css), so consumers only need to import that
 * stylesheet — or pass their own `className` / `digitClassName`.
 */
export const OtpDigitInput = forwardRef<OtpDigitInputHandle, OtpDigitInputProps>(function OtpDigitInput(
  {
    value,
    onChange,
    onComplete,
    onSubmit,
    disabled = false,
    length = 6,
    autoFocus = true,
    className,
    digitClassName
  },
  ref
) {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  useImperativeHandle(ref, () => ({
    focus: () => inputRefs.current[0]?.focus(),
    reset: () => {
      onChange(Array(length).fill(''))
      setTimeout(() => inputRefs.current[0]?.focus(), 0)
    }
  }), [length, onChange])

  useEffect(() => {
    if (autoFocus) inputRefs.current[0]?.focus()
  }, [])

  const handleDigitChange = (index: number, raw: string) => {
    if (!/^\d*$/.test(raw)) return
    const next = [...value]
    next[index] = raw.slice(-1)
    onChange(next)

    if (raw && index < length - 1) {
      inputRefs.current[index + 1]?.focus()
    }

    const code = next.join('')
    if (code.length === length && next.every((d) => d !== '')) {
      onComplete?.(code)
    }
  }

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !value[index] && index > 0) {
      inputRefs.current[index - 1]?.focus()
    }
    if (e.key === 'Enter') {
      onSubmit?.()
    }
    if (e.key === 'ArrowLeft' && index > 0) {
      e.preventDefault()
      inputRefs.current[index - 1]?.focus()
    }
    if (e.key === 'ArrowRight' && index < length - 1) {
      e.preventDefault()
      inputRefs.current[index + 1]?.focus()
    }
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length)
    if (!pasted) return

    const next = Array(length)
      .fill('')
      .map((_, i) => pasted[i] || '')
    onChange(next)

    const focusIdx = Math.min(pasted.length, length - 1)
    inputRefs.current[focusIdx]?.focus()

    if (pasted.length === length) {
      onComplete?.(pasted)
    }
  }

  return (
    <div
      className={`d-flex gap-2 login-modal-otp-group ${className ?? ''}`}
      onPaste={handlePaste}
    >
      {Array.from({ length }).map((_, i) => {
        const digit = value[i] ?? ''
        return (
          <input
            key={i}
            ref={(el) => { inputRefs.current[i] = el }}
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            className={`login-modal-otp-digit ${digit ? 'has-value' : ''} ${digitClassName ?? ''}`}
            maxLength={1}
            value={digit}
            onChange={(e) => handleDigitChange(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            onFocus={(e) => e.target.select()}
            autoFocus={autoFocus && i === 0}
            disabled={disabled}
          />
        )
      })}
    </div>
  )
})
