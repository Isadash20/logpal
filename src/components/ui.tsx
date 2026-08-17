import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Icon, type IconName } from './Icon'
import { useApp } from '../state/store'
import {
  WEEKDAY_INITIALS,
  addMonths,
  fromKey,
  isSameMonth,
  monthGrid,
  monthLabel,
  today,
} from '../lib/dates'

/* ----------------------------------------------------------------- sheet -- */

export function Sheet({
  title,
  onClose,
  /** Extra class on the panel — e.g. "sheet--split" for a pinned footer. */
  className,
  children,
}: {
  title?: string
  onClose(): void
  className?: string
  children: ReactNode
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="scrim" onClick={onClose} role="presentation">
      <div
        className={'sheet' + (className ? ' ' + className : '')}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
      >
        <div className="sheet__grip" />
        {title && <div className="sheet__title">{title}</div>}
        {children}
      </div>
    </div>
  )
}

export function Dialog({
  title,
  onClose,
  children,
}: {
  title?: string
  onClose(): void
  children: ReactNode
}) {
  return (
    <div className="scrim scrim--center" onClick={onClose} role="presentation">
      <div className="dialog" onClick={(e) => e.stopPropagation()} role="dialog">
        {title && (
          <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 10 }}>{title}</div>
        )}
        {children}
      </div>
    </div>
  )
}

export function SheetAction({
  icon,
  label,
  danger,
  onClick,
}: {
  icon?: IconName
  label: string
  danger?: boolean
  onClick(): void
}) {
  return (
    <button className="row" onClick={onClick}>
      {icon && (
        <span style={{ color: danger ? 'var(--danger)' : 'var(--text-2)', display: 'flex' }}>
          <Icon name={icon} size={20} />
        </span>
      )}
      <span
        className="row__main row__title"
        style={{ color: danger ? 'var(--danger)' : undefined }}
      >
        {label}
      </span>
    </button>
  )
}

/* ------------------------------------------------------------------ rows -- */

export function Row({
  title,
  sub,
  value,
  chevron,
  onClick,
  right,
  left,
  className = '',
}: {
  title: ReactNode
  sub?: ReactNode
  value?: ReactNode
  chevron?: boolean
  onClick?(): void
  right?: ReactNode
  left?: ReactNode
  className?: string
}) {
  const inner = (
    <>
      {left}
      <span className="row__main">
        <span className="row__title" style={{ display: 'block' }}>
          {title}
        </span>
        {sub != null && sub !== '' && (
          <span className="row__sub" style={{ display: 'block' }}>
            {sub}
          </span>
        )}
      </span>
      {value != null && <span className="row__value">{value}</span>}
      {right}
      {chevron && (
        <span className="row__chev">
          <Icon name="forward" size={17} strokeWidth={2.2} />
        </span>
      )}
    </>
  )

  if (!onClick) return <div className={`row ${className}`}>{inner}</div>

  /* A trailing action button can't live inside the row's own <button> — nested
     buttons are invalid HTML and swallow the inner click. When one is present
     the row body becomes the button and the action sits beside it. */
  if (right) {
    return (
      <div className={`row row--split ${className}`}>
        <button className="row__body" onClick={onClick}>
          {left}
          <span className="row__main">
            <span className="row__title" style={{ display: 'block' }}>
              {title}
            </span>
            {sub != null && sub !== '' && (
              <span className="row__sub" style={{ display: 'block' }}>
                {sub}
              </span>
            )}
          </span>
          {value != null && <span className="row__value">{value}</span>}
        </button>
        <span className="row__aside">
          {right}
          {chevron && (
            <span className="row__chev">
              <Icon name="forward" size={17} strokeWidth={2.2} />
            </span>
          )}
        </span>
      </div>
    )
  }

  return (
    <button className={`row ${className}`} onClick={onClick}>
      {inner}
    </button>
  )
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return <div className="section-label">{children}</div>
}

/**
 * A full-width tappable card that opens its own page. Used instead of long
 * inline setting lists — one decision per screen reads far better on a phone
 * than forty controls stacked on top of each other.
 */
export function Banner({
  icon,
  title,
  sub,
  onClick,
  value,
}: {
  icon: IconName
  title: string
  sub?: string
  value?: ReactNode
  onClick(): void
}) {
  return (
    <button className="banner" onClick={onClick}>
      <span className="banner__icon">
        <Icon name={icon} size={20} />
      </span>
      <span className="banner__main">
        <span className="banner__title">{title}</span>
        {sub && <span className="banner__sub">{sub}</span>}
      </span>
      {value != null && <span className="banner__value">{value}</span>}
      <span className="row__chev">
        <Icon name="forward" size={18} strokeWidth={2.2} />
      </span>
    </button>
  )
}

/** Sticky footer holding the one committing action on a settings page. */
export function SaveBar({
  onSave,
  label = 'Save',
  disabled,
}: {
  onSave(): void
  label?: string
  disabled?: boolean
}) {
  return (
    <div className="savebar">
      <button className="btn" onClick={onSave} disabled={disabled}>
        {label}
      </button>
    </div>
  )
}

/* --------------------------------------------------------------- topbar --- */

export function TopBar({
  title,
  left,
  right,
  onBack,
  solid,
}: {
  title?: ReactNode
  left?: ReactNode
  right?: ReactNode
  onBack?(): void
  /** Opaque with a hairline — for pushed screens that sit on white. */
  solid?: boolean
}) {
  return (
    <div className={`topbar ${solid ? 'topbar--solid' : ''}`}>
      <div className="topbar__side">
        {onBack && (
          <button className="iconbtn" onClick={onBack} aria-label="Back">
            <Icon name="back" size={22} strokeWidth={2.2} />
          </button>
        )}
        {left}
      </div>
      <div className="topbar__title">{title}</div>
      <div className="topbar__side topbar__side--right">{right}</div>
    </div>
  )
}

/* -------------------------------------------------------------- controls -- */

export function NumberField({
  label,
  value,
  onChange,
  unit,
  placeholder,
  step = 'any',
  autoFocus,
}: {
  label: string
  value: string
  onChange(v: string): void
  unit?: string
  placeholder?: string
  step?: string
  autoFocus?: boolean
}) {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      <span className="field__control">
        <input
          className="input"
          type="number"
          inputMode="decimal"
          step={step}
          value={value}
          placeholder={placeholder ?? '0'}
          autoFocus={autoFocus}
          onChange={(e) => onChange(e.target.value)}
          onFocus={(e) => e.target.select()}
        />
        {unit && <span className="unit">{unit}</span>}
      </span>
    </label>
  )
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  autoFocus,
}: {
  label: string
  value: string
  onChange(v: string): void
  placeholder?: string
  autoFocus?: boolean
}) {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      <span className="field__control">
        <input
          className="input"
          value={value}
          placeholder={placeholder}
          autoFocus={autoFocus}
          onChange={(e) => onChange(e.target.value)}
        />
      </span>
    </label>
  )
}

/* `NoInfer` on the collection props keeps TypeScript inferring the generic from
   `value`/`active` rather than widening an inline array literal to `string`. */

export function SelectField<T extends string | number>({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: T
  onChange(v: NoInfer<T>): void
  options: { value: NoInfer<T>; label: string }[]
}) {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      <span className="field__control">
        <select
          className="select"
          value={String(value)}
          onChange={(e) => {
            const raw = e.target.value
            const match = options.find((o) => String(o.value) === raw)
            if (match) onChange(match.value)
          }}
        >
          {options.map((o) => (
            <option key={String(o.value)} value={String(o.value)}>
              {o.label}
            </option>
          ))}
        </select>
        <span style={{ color: 'var(--text-3)', display: 'flex' }}>
          <Icon name="down" size={16} strokeWidth={2.4} />
        </span>
      </span>
    </label>
  )
}

export function Toggle({
  label,
  sub,
  checked,
  onChange,
}: {
  label: string
  sub?: string
  checked: boolean
  onChange(v: boolean): void
}) {
  return (
    <button className="row" onClick={() => onChange(!checked)}>
      <span className="row__main">
        <span className="row__title" style={{ display: 'block' }}>
          {label}
        </span>
        {sub && (
          <span className="row__sub" style={{ display: 'block', whiteSpace: 'normal' }}>
            {sub}
          </span>
        )}
      </span>
      <span
        style={{
          width: 44,
          height: 26,
          borderRadius: 999,
          background: checked ? 'var(--accent)' : 'var(--border-strong)',
          position: 'relative',
          transition: 'background .18s',
          flex: 'none',
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: 3,
            left: checked ? 21 : 3,
            width: 20,
            height: 20,
            borderRadius: 999,
            background: '#fff',
            transition: 'left .18s',
            boxShadow: '0 1px 3px rgba(0,0,0,.3)',
          }}
        />
      </span>
    </button>
  )
}

export function Stepper({
  value,
  onChange,
  step = 0.5,
  min = 0.25,
}: {
  value: number
  onChange(v: number): void
  step?: number
  min?: number
}) {
  return (
    <div className="stack-h" style={{ gap: 4 }}>
      <button
        className="iconbtn"
        onClick={() => onChange(Math.max(min, +(value - step).toFixed(2)))}
        aria-label="Decrease"
      >
        <Icon name="minus" size={18} />
      </button>
      <button
        className="iconbtn"
        onClick={() => onChange(+(value + step).toFixed(2))}
        aria-label="Increase"
      >
        <Icon name="plus" size={18} />
      </button>
    </div>
  )
}

export function Tabs<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: { key: NoInfer<T>; label: string }[]
  active: T
  onChange(k: NoInfer<T>): void
}) {
  return (
    <div className="tabs">
      {tabs.map((t) => (
        <button
          key={t.key}
          className={`tabs__item ${active === t.key ? 'tabs__item--active' : ''}`}
          onClick={() => onChange(t.key)}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty__title">{title}</div>
      {children}
    </div>
  )
}

export function Spinner() {
  return (
    <div className="center-pad">
      <div className="spinner" />
    </div>
  )
}

/* -------------------------------------------------------------- date nav -- */

export function DateNav({
  date,
  onChange,
  label,
}: {
  date: string
  onChange(d: string): void
  label: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <div className="stack-h" style={{ gap: 0 }}>
        <button
          className="iconbtn"
          onClick={() => onChange(shift(date, -1))}
          aria-label="Previous day"
        >
          <Icon name="back" size={20} strokeWidth={2.3} />
        </button>
        <button
          onClick={() => setOpen(true)}
          style={{ fontWeight: 700, fontSize: 15.5, padding: '6px 4px', minWidth: 110 }}
        >
          {label}
        </button>
        <button
          className="iconbtn"
          onClick={() => onChange(shift(date, 1))}
          aria-label="Next day"
        >
          <Icon name="forward" size={20} strokeWidth={2.3} />
        </button>
      </div>
      {open && (
        <CalendarSheet
          date={date}
          onClose={() => setOpen(false)}
          onPick={(d) => {
            onChange(d)
            setOpen(false)
          }}
        />
      )}
    </>
  )
}

function shift(key: string, n: number) {
  const d = fromKey(key)
  d.setDate(d.getDate() + n)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

export function CalendarSheet({
  date,
  onClose,
  onPick,
}: {
  date: string
  onClose(): void
  onPick(d: string): void
}) {
  const [month, setMonth] = useState(date)
  const { data } = useApp()
  const grid = monthGrid(month)
  const logged = new Set(data.foodEntries.map((e) => e.date))
  const t = today()

  return (
    <Sheet onClose={onClose}>
      <div
        className="stack-h"
        style={{ padding: '4px 12px 10px', justifyContent: 'space-between' }}
      >
        <button className="iconbtn" onClick={() => setMonth(addMonths(month, -1))}>
          <Icon name="back" size={20} />
        </button>
        <div style={{ fontWeight: 700 }}>{monthLabel(month)}</div>
        <button className="iconbtn" onClick={() => setMonth(addMonths(month, 1))}>
          <Icon name="forward" size={20} />
        </button>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7,1fr)',
          padding: '0 10px 6px',
        }}
      >
        {WEEKDAY_INITIALS.map((w, i) => (
          <div
            key={i}
            style={{
              textAlign: 'center',
              fontSize: 11,
              fontWeight: 700,
              color: 'var(--text-3)',
              paddingBottom: 6,
            }}
          >
            {w}
          </div>
        ))}
        {grid.map((k) => {
          const inMonth = isSameMonth(k, month)
          const selected = k === date
          return (
            <button
              key={k}
              onClick={() => onPick(k)}
              style={{
                aspectRatio: '1',
                display: 'grid',
                placeContent: 'center',
                borderRadius: 999,
                fontSize: 14,
                fontWeight: selected || k === t ? 700 : 400,
                color: selected
                  ? 'var(--on-accent)'
                  : inMonth
                    ? k === t
                      ? 'var(--accent)'
                      : 'var(--text)'
                    : 'var(--text-3)',
                background: selected ? 'var(--accent)' : 'transparent',
                position: 'relative',
              }}
            >
              {fromKey(k).getDate()}
              {logged.has(k) && !selected && (
                <span
                  style={{
                    position: 'absolute',
                    bottom: 5,
                    width: 4,
                    height: 4,
                    borderRadius: 999,
                    background: 'var(--accent)',
                  }}
                />
              )}
            </button>
          )
        })}
      </div>
      <div className="btn-wrap">
        <button className="btn btn--ghost" onClick={() => onPick(t)}>
          Today
        </button>
      </div>
    </Sheet>
  )
}

/* ---------------------------------------------------------- long actions -- */

/** Renders children and opens `menu` on click of the trailing ⋮ button. */
export function OverflowButton({ onClick }: { onClick(): void }) {
  const ref = useRef<HTMLButtonElement>(null)
  return (
    <button
      ref={ref}
      className="iconbtn"
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      aria-label="More options"
    >
      <Icon name="more" size={20} strokeWidth={2.6} />
    </button>
  )
}
