import { useState, useRef, useEffect } from 'react'
import { DayPicker } from 'react-day-picker'
import { format, isValid } from 'date-fns'
import { CalendarIcon, X } from 'lucide-react'

interface DatePickerProps {
  value: string          // ISO date string 'YYYY-MM-DD'
  onChange: (val: string) => void
  min?: string           // ISO date string
  placeholder?: string
}

export function DatePicker({ value, onChange, min, placeholder = 'Pick a date' }: DatePickerProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const selected = value ? new Date(value + 'T00:00:00') : undefined
  const minDate = min ? new Date(min + 'T00:00:00') : undefined

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function handleSelect(day: Date | undefined) {
    if (!day) return
    onChange(format(day, 'yyyy-MM-dd'))
    setOpen(false)
  }

  const displayValue = selected && isValid(selected) ? format(selected, 'MMM d, yyyy') : ''

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`w-full flex items-center gap-2 rounded-lg border bg-background px-3 py-2.5 text-sm text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
          open ? 'ring-2 ring-primary border-primary' : 'hover:border-primary/50'
        }`}
      >
        <CalendarIcon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        <span className={displayValue ? 'text-foreground flex-1' : 'text-muted-foreground flex-1'}>
          {displayValue || placeholder}
        </span>
        {displayValue && (
          <span
            role="button"
            onClick={e => { e.stopPropagation(); onChange(''); setOpen(false) }}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </span>
        )}
      </button>

      {open && (
        <div className="absolute z-50 mt-1.5 rounded-xl border bg-card shadow-lg p-3 left-0">
          <DayPicker
            mode="single"
            selected={selected}
            onSelect={handleSelect}
            disabled={minDate ? { before: minDate } : undefined}
            defaultMonth={selected ?? minDate}
            classNames={{
              root: 'text-sm',
              months: 'flex gap-4',
              month: 'space-y-3',
              month_caption: 'flex items-center justify-between px-1 mb-1',
              caption_label: 'text-sm font-semibold',
              nav: 'flex items-center gap-1',
              button_previous: 'h-7 w-7 rounded-lg border flex items-center justify-center hover:bg-muted transition-colors text-muted-foreground hover:text-foreground',
              button_next: 'h-7 w-7 rounded-lg border flex items-center justify-center hover:bg-muted transition-colors text-muted-foreground hover:text-foreground',
              weeks: 'space-y-1',
              weekdays: 'flex',
              weekday: 'w-8 text-center text-[11px] font-medium text-muted-foreground',
              week: 'flex',
              day: 'w-8 h-8 flex items-center justify-center rounded-lg text-sm transition-colors',
              day_button: 'w-full h-full flex items-center justify-center rounded-lg hover:bg-muted transition-colors cursor-pointer disabled:text-muted-foreground/40 disabled:cursor-not-allowed',
              selected: '!bg-primary !text-white hover:!bg-primary',
              today: 'font-semibold text-primary',
              outside: 'text-muted-foreground/30',
              disabled: 'text-muted-foreground/30 cursor-not-allowed',
            }}
          />
        </div>
      )}
    </div>
  )
}
