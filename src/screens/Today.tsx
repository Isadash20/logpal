import { useMemo, useState } from 'react'
import { MEAL_KEYS, PERIOD_LABELS } from '../types'
import { useApp } from '../state/store'
import { Icon } from '../components/Icon'
import { TopBar } from '../components/ui'
import { WeekStrip } from '../components/charts'
import { WidgetGrid } from '../components/WidgetGrid'
import { cal } from '../lib/format'
import { addDays, longDate, today } from '../lib/dates'

/**
 * Home screen, laid out to match the reference app: a calorie bar, a macro
 * bar, then plain rows. Deliberately flat — no rings or donuts here. The rich
 * charts live on Progress and Nutrition, where someone has gone looking.
 */
export function Today() {
  const app = useApp()
  const {
    date,
    setDate,
    totalsFor,
    dayLog,
    logStreak,
    push,
    setTab,
    entriesFor,
  } = app

  const totals = totalsFor(date)
  const log = dayLog(date)

  const week = useMemo(() => {
    const out: {
      label: string
      logged: boolean
      date: string
      selected?: boolean
      isToday?: boolean
    }[] = []
    // Monday-first, matching the reference app's default week start.
    const d0 = new Date(date + 'T00:00:00')
    const offset = (d0.getDay() + 6) % 7
    const realToday = today()
    for (let i = 0; i < 7; i++) {
      const d = addDays(date, i - offset)
      out.push({
        label: ['M', 'T', 'W', 'T', 'F', 'S', 'S'][i],
        logged: totalsFor(d).nutrients.calories > 0,
        date: d,
        selected: d === date,
        isToday: d === realToday,
      })
    }
    return out
  }, [date, totalsFor])

  /* The streak lives in the store now: a day counts as logged when it has
     calories on it, the same rule the week strip's ticks use above, and the
     same number followers are shown. One rule, one place, so the three cannot
     disagree. */

  /* Arranging the board. Not persisted: it is a mode, not a preference, and
     coming back to Home in edit mode would be a small trap. */
  const [editing, setEditing] = useState(false)

  return (
    <>
      <TopBar
        right={
          <>
            {/* Sits beside Your plan rather than inside Settings: rearranging
                the board is something you do while looking at it. */}
            <button
              className="textbtn"
              style={{ padding: '0 4px', fontSize: 13.5 }}
              onClick={() => setEditing((v) => !v)}
            >
              {editing ? 'Done' : 'Edit widgets'}
            </button>
            <button
              className="goldpill"
              onClick={() => push({ name: 'goals' })}
              aria-label="Your plan"
            >
              Your plan
            </button>
            <button className="iconbtn" onClick={() => setTab('more')} aria-label="Settings">
              <Icon name="settings" size={21} />
            </button>
          </>
        }
      />

      <div className="scroll">
        <div className="pagetitle">
          {date === today() ? 'Today' : longDate(date)}
          {/* Only from one day — a streak of zero is not worth a badge, and
              showing "0" on day one is discouraging rather than motivating. */}
          {logStreak > 0 && (
            <span className="streak" title={`${logStreak} days logged in a row`}>
              <Icon name="flame" size={14} />
              <span className="num">{logStreak}</span>
              <span className="streak__unit">
                {logStreak === 1 ? 'day' : 'days'}
              </span>
            </span>
          )}
        </div>

        <div style={{ padding: '0 12px 16px' }}>
          <WeekStrip days={week} onPick={setDate} />
        </div>

        {/* --------------------------------------------------------- board -- */}
        {/* Everything above the diary is a widget now. Which of these matter is
            personal — a fasting timer to one person, calories to another, step
            counts to nobody at all — so the board is arranged rather than
            fixed. See lib/widgetLayout.ts. */}
        <WidgetGrid date={date} editing={editing} onEditingChange={setEditing} />

        <div style={{ height: 16 }} />

        {/* ---------------------------------------------------------- diary -- */}
        <div className="section-head">
          <span>Diary</span>
          <button className="textbtn" style={{ padding: 0 }} onClick={() => push({ name: 'diary' })}>
            View all
          </button>
        </div>

        {/* One card per period, spaced apart — matching the reference layout. */}
        {MEAL_KEYS.map((period) => {
          const items = entriesFor(date, period)
          return (
            <div className="card" key={period} style={{ marginBottom: 10 }}>
              <div className="row" style={{ borderBottom: 0 }}>
                <span style={{ color: 'var(--accent)', display: 'flex', flex: 'none' }}>
                  <Icon name={PERIOD_ICON[period]} size={21} />
                </span>
                <span className="row__main">
                  <span className="row__title" style={{ display: 'block', fontWeight: 500 }}>
                    {PERIOD_LABELS[period]}
                  </span>
                  {items.length > 0 && (
                    <span className="row__sub" style={{ display: 'block' }}>
                      {items.map((i) => i.name).join(', ')}
                    </span>
                  )}
                  {items.length > 0 && (
                    <span className="row__sub" style={{ display: 'block' }}>
                      {cal(totals.byMeal[period].calories)} cal
                    </span>
                  )}
                </span>
                <button
                  className="iconbtn"
                  style={{ width: 32, height: 32, flex: 'none' }}
                  onClick={() => push({ name: 'diary' })}
                  aria-label={`${PERIOD_LABELS[period]} options`}
                >
                  <Icon name="dots" size={18} />
                </button>
                <button className="logpill" onClick={() => push({ name: 'foodSearch', date })}>
                  Log
                </button>
              </div>
            </div>
          )
        })}

        <div style={{ textAlign: 'center', padding: '6px 16px 4px' }}>
          <button
            className="textbtn"
            style={{ fontWeight: 700, fontSize: 16 }}
            onClick={() => {
              app.setCompleted(date, !log.completed)
            }}
          >
            {log.completed ? 'Day complete ✓' : 'Complete diary'}
          </button>
        </div>

      </div>
    </>
  )
}
const PERIOD_ICON = {
  morning: 'sunrise',
  afternoon: 'sun',
  evening: 'moon',
  late: 'stars',
} as const
