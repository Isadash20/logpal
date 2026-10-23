import { useEffect, useMemo, useState } from 'react'
import { MEAL_KEYS, PERIOD_LABELS } from '../types'
import { useApp } from '../state/store'
import { Icon } from '../components/Icon'
import { WeekStrip } from '../components/charts'
import { WidgetGrid } from '../components/WidgetGrid'
import { Confetti, celebratedToday, markCelebrated } from '../components/Confetti'
import { cal } from '../lib/format'
import { addDays, longDate, today } from '../lib/dates'

/**
 * Home.
 *
 * Laid out the way the trackers studied for DESIGN.md lay out their day
 * screen: a header in the flow of the page (date, a large title, the streak
 * and the way into Settings), the dated week, the arrangeable board, then the
 * day's meals as rows with an add button on each. Content on white, nothing
 * to scroll past before the numbers.
 */
export function Today() {
  const app = useApp()
  const {
    date,
    setDate,
    totalsFor,
    dayLog,
    macroTargets,
    logStreak,
    push,
    setTab,
    entriesFor,
  } = app

  const totals = totalsFor(date)
  const log = dayLog(date)

  /* Every macro target met is the one moment in the day worth marking, so it
     is marked once and then left alone. */
  const [celebrating, setCelebrating] = useState(false)
  useEffect(() => {
    const n = totals.nutrients
    const allMet =
      n.protein >= macroTargets.protein &&
      n.carbs >= macroTargets.carbs &&
      n.fat >= macroTargets.fat
    if (!allMet || celebratedToday(date)) return
    markCelebrated(date)
    setCelebrating(true)
  }, [date, totals.nutrients, macroTargets])

  const week = useMemo(() => {
    const out: {
      label: string
      logged: boolean
      date: string
      selected?: boolean
      isToday?: boolean
      future?: boolean
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
        future: d > realToday,
      })
    }
    return out
  }, [date, totalsFor])

  /* The streak lives in the store: a day counts as logged when it has
     calories on it, the same rule the week strip uses and the same number
     followers are shown. One rule, one place, so the three cannot disagree. */

  /* Arranging the board. Not persisted: it is a mode, not a preference, and
     coming back to Home in edit mode would be a small trap. */
  const [editing, setEditing] = useState(false)

  /* The eyebrow carries the full date, so the title must not repeat it. It
     names the day in relation to now instead, which is the thing the date
     itself cannot tell you at a glance. */
  const relative =
    date === today()
      ? 'Today'
      : date === addDays(today(), -1)
        ? 'Yesterday'
        : date === addDays(today(), 1)
          ? 'Tomorrow'
          : null

  const [weekday, monthDay] = longDate(date).split(', ')
  const dayTitle = relative ?? weekday
  const dayEyebrow = relative ? `${weekday}, ${monthDay}` : monthDay

  return (
    <>
      {celebrating && <Confetti onDone={() => setCelebrating(false)} />}

      <div className="scroll">
        <div className="home-head">
          <div className="home-head__top">
            <div className="home-head__text">
              <span className="home-head__eyebrow">{dayEyebrow}</span>
              <h1 className="home-head__title">{dayTitle}</h1>
            </div>
            {/* Only from one day. A streak of zero is not worth a badge, and
                showing "0" on day one is discouraging rather than motivating. */}
            {logStreak > 0 && (
              <span className="pill" title={`${logStreak} days logged in a row`}>
                <span className="pill__flame">
                  <Icon name="flame" size={16} strokeWidth={2.2} />
                </span>
                <span className="num">{logStreak}</span>
              </span>
            )}
            <button
              className="pill pill--icon"
              onClick={() => setTab('more')}
              aria-label="Settings"
            >
              <Icon name="settings" size={19} />
            </button>
          </div>

          <WeekStrip days={week} onPick={setDate} />
        </div>

        <div className="boardbar">
          <button className="boardbar__btn" onClick={() => setEditing((v) => !v)}>
            {editing ? 'Done' : 'Edit widgets'}
          </button>
        </div>

        {/* --------------------------------------------------------- board -- */}
        {/* Which of these matter is personal. A fasting timer to one person,
            calories to another, step counts to nobody at all, so the board is
            arranged rather than fixed. See lib/widgetLayout.ts. */}
        <WidgetGrid date={date} editing={editing} onEditingChange={setEditing} />

        {/* ---------------------------------------------------------- meals -- */}
        <div className="section-head">
          <span>Meals</span>
          <button className="textbtn" style={{ padding: 0 }} onClick={() => push({ name: 'diary' })}>
            Open diary
          </button>
        </div>

        <div className="card">
          {MEAL_KEYS.map((period) => {
            const items = entriesFor(date, period)
            const kcal = totals.byMeal[period].calories
            const tint = PERIOD_TINT[period]
            const label = PERIOD_LABELS[period]
            return (
              <div className="meal" key={period}>
                {/* The row body opens the diary once something is in it and
                    goes straight to search while it is empty; the round button
                    always logs. Two targets, both obvious, neither nested. */}
                <button
                  className="meal__body"
                  onClick={() =>
                    items.length
                      ? push({ name: 'diary' })
                      : push({ name: 'foodSearch', date, meal: period })
                  }
                  aria-label={items.length ? `${label} in the diary` : `Log ${label}`}
                >
                  <span
                    className="meal__icon"
                    style={{
                      background: `color-mix(in srgb, ${tint} 14%, var(--surface))`,
                      color: tint,
                    }}
                  >
                    <Icon name={PERIOD_ICON[period]} size={21} strokeWidth={2} />
                  </span>
                  <span className="meal__main">
                    <span className="meal__name">{label}</span>
                    <span className="meal__sub">
                      {items.length ? items.map((i) => i.name).join(', ') : 'Nothing logged yet'}
                    </span>
                  </span>
                  {items.length > 0 && (
                    <span className="meal__cal num">
                      {cal(kcal)}
                      <small>cal</small>
                    </span>
                  )}
                </button>
                <button
                  className="meal__add"
                  onClick={() => push({ name: 'foodSearch', date, meal: period })}
                  aria-label={`Add to ${label}`}
                >
                  <Icon name="plus" size={18} strokeWidth={2.4} />
                </button>
              </div>
            )
          })}
        </div>

        <div className="btn-wrap" style={{ paddingTop: 4 }}>
          <button
            className="btn btn--ghost"
            onClick={() => app.setCompleted(date, !log.completed)}
          >
            {log.completed && <Icon name="check" size={18} strokeWidth={2.4} />}
            {log.completed ? 'Day complete' : 'Complete diary'}
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

/* Each meal's icon sits on its own tint, so the four rows can be told apart
   before the words are read. Drawn from the tokens so the row never carries a
   colour the rest of the app does not. */
const PERIOD_TINT = {
  morning: 'var(--warning)',
  afternoon: 'var(--fat)',
  evening: 'var(--accent)',
  late: 'var(--sleep)',
} as const
