import { useState } from 'react'
import { useApp } from '../state/store'
import { Icon } from '../components/Icon'
import { Row, TopBar } from '../components/ui'
import { BarChart } from '../components/charts'
import { addDays, fromKey, lastNDays, today } from '../lib/dates'

/**
 * Sleep and steps.
 *
 * Both are typed in. The web has no pedometer and no access to a phone's health
 * store, so there is nothing to read from, which is why every screen here says
 * what it is showing you rather than implying a sensor. A day with no entry is
 * left out of the averages instead of counting as a zero.
 */

/** "7h 30m", hours first, because that is how anyone says it. */
export function formatSleep(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  if (!h) return `${m}m`
  return m ? `${h}h ${m}m` : `${h}h`
}

/** M T W T F S S, `shortDate` gives "Aug 19", whose initial is the month. */
function weekdayInitial(key: string): string {
  return fromKey(key).toLocaleDateString(undefined, { weekday: 'narrow' })
}

function averageOf(values: number[]): number | null {
  if (!values.length) return null
  return values.reduce((a, b) => a + b, 0) / values.length
}

/* --------------------------------------------------------------- sleep ---- */

export function SleepScreen({ date }: { date: string }) {
  const { pop, dayLog, setSleep, profile, saveProfile } = useApp()
  const log = dayLog(date)
  const goal = profile.sleepGoalMin
  const slept = log.sleepMin ?? 0
  const pctFull = goal > 0 ? Math.min(1, slept / goal) : 0

  /* Last night, not tonight. Sleep is recorded in the morning for the night
     that just ended, so the entry belongs to the day you wake up on, which is
     what `date` already is. */
  const week = lastNDays(7)
  const recorded = week.map((d) => dayLog(d).sleepMin).filter((v): v is number => v != null)
  const avg = averageOf(recorded)

  const adjust = (delta: number) => setSleep(date, Math.max(0, slept + delta))

  return (
    <>
      <TopBar title="Sleep" onBack={pop} />
      <div className="scroll">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 22,
            padding: '24px 20px',
            background: 'var(--surface)',
            borderBottom: '1px solid var(--border)',
          }}
        >
          {/* A ring that fills towards the target, in the same language the
              fasting dial uses. This is a duration against a goal too. */}
          <svg width="112" height="112" viewBox="0 0 120 120" aria-hidden="true">
            <circle cx="60" cy="60" r="50" fill="none" stroke="var(--border)" strokeWidth="11" />
            {/* No arc at all when nothing is logged: a round cap on a
                zero-length dash still paints a dot, which reads as progress. */}
            {pctFull > 0 && (
              <circle
                cx="60"
                cy="60"
                r="50"
                fill="none"
                stroke="var(--sleep)"
                strokeWidth="11"
                strokeLinecap="round"
                strokeDasharray={`${pctFull * 314} 314`}
                transform="rotate(-90 60 60)"
                style={{ transition: 'stroke-dasharray .45s ease' }}
              />
            )}
            <g transform="translate(47 47)">
              <Icon name="moon" size={26} />
            </g>
          </svg>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              className="num"
              style={{ fontSize: 38, fontWeight: 800, letterSpacing: '-0.035em', lineHeight: 1.05 }}
            >
              {log.sleepMin == null ? '-' : formatSleep(slept)}
              <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-2)' }}>
                {' '}
                / {formatSleep(goal)}
              </span>
            </div>
            <div style={{ color: 'var(--text-2)', fontSize: 13.5, marginTop: 4 }}>
              {log.sleepMin == null
                ? 'Nothing logged for this night'
                : slept >= goal
                  ? 'Target met'
                  : `${formatSleep(goal - slept)} short of target`}
            </div>
          </div>
        </div>

        {/* Whole and half hours cover almost every answer; the steppers handle
            the rest without a keyboard. */}
        <div className="section-label">Log this night</div>
        <div className="card" style={{ paddingBottom: 12 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: '10px 16px 2px' }}>
            {[300, 360, 390, 420, 450, 480, 510, 540].map((m) => (
              <button
                key={m}
                className={`fpill ${log.sleepMin === m ? 'fpill--on' : ''}`}
                onClick={() => setSleep(date, m)}
              >
                {formatSleep(m)}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 10, padding: '12px 16px 4px', alignItems: 'center' }}>
            <button className="btn btn--ghost" onClick={() => adjust(-15)} disabled={slept <= 0}>
              −15m
            </button>
            <button className="btn btn--ghost" onClick={() => adjust(15)}>
              +15m
            </button>
            {log.sleepMin != null && (
              <button className="textbtn" onClick={() => setSleep(date, null)}>
                Clear
              </button>
            )}
          </div>
        </div>

        <div className="section-label">This week</div>
        <div className="card" style={{ paddingTop: 10, paddingBottom: 6 }}>
          <BarChart
            bars={week.map((d) => ({
              label: weekdayInitial(d),
              value: (dayLog(d).sleepMin ?? 0) / 60,
            }))}
            goal={goal / 60}
            unit="h"
            color="var(--sleep)"
            overIsBad={false}
          />
          <Row
            title="Average a night"
            /* Nights with no entry are left out rather than averaged in as
               zero, which would drag a good week down to nothing. */
            value={avg == null ? 'No nights logged' : formatSleep(avg)}
          />
          <Row title="Nights recorded" value={`${recorded.length} of 7`} />
        </div>

        <div className="section-label">Target</div>
        <div className="card">
          <Row
            title="Nightly target"
            value={formatSleep(goal)}
            right={
              <span style={{ display: 'flex', gap: 6 }}>
                <button
                  className="btn btn--ghost"
                  onClick={() => saveProfile({ sleepGoalMin: Math.max(240, goal - 30) })}
                  aria-label="Lower target"
                >
                  −
                </button>
                <button
                  className="btn btn--ghost"
                  onClick={() => saveProfile({ sleepGoalMin: Math.min(720, goal + 30) })}
                  aria-label="Raise target"
                >
                  +
                </button>
              </span>
            }
          />
        </div>

        <div style={{ height: 24 }} />
      </div>
    </>
  )
}

/* --------------------------------------------------------------- steps ---- */

export function StepsScreen({ date }: { date: string }) {
  const { pop, dayLog, setSteps, profile, saveProfile } = useApp()
  const [typed, setTyped] = useState('')
  const log = dayLog(date)
  const goal = profile.stepGoal
  const walked = log.steps ?? 0
  const pctFull = goal > 0 ? Math.min(1, walked / goal) : 0

  const week = lastNDays(7)
  const recorded = week.map((d) => dayLog(d).steps).filter((v): v is number => v != null)
  const avg = averageOf(recorded)
  const best = recorded.length ? Math.max(...recorded) : null

  /* Stride is roughly 0.42 × height for walking, so this is a rule of thumb
     and says so. It is not added to the diary: exercise you logged is already
     counted there, and adding both would pay you twice for one walk. */
  const km = (walked * (profile.heightIn * 0.0254 * 0.415)) / 1000

  const commit = () => {
    const n = parseInt(typed.replace(/[^\d]/g, ''), 10)
    if (!Number.isNaN(n)) setSteps(date, n)
    setTyped('')
  }

  return (
    <>
      <TopBar title="Steps" onBack={pop} />
      <div className="scroll">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 22,
            padding: '24px 20px',
            background: 'var(--surface)',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <svg width="112" height="112" viewBox="0 0 120 120" aria-hidden="true">
            <circle cx="60" cy="60" r="50" fill="none" stroke="var(--border)" strokeWidth="11" />
            {pctFull > 0 && (
              <circle
                cx="60"
                cy="60"
                r="50"
                fill="none"
                stroke="var(--steps)"
                strokeWidth="11"
                strokeLinecap="round"
                strokeDasharray={`${pctFull * 314} 314`}
                transform="rotate(-90 60 60)"
                style={{ transition: 'stroke-dasharray .45s ease' }}
              />
            )}
            <g transform="translate(47 47)">
              <Icon name="steps" size={26} />
            </g>
          </svg>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              className="num"
              style={{ fontSize: 38, fontWeight: 800, letterSpacing: '-0.035em', lineHeight: 1.05 }}
            >
              {log.steps == null ? '-' : walked.toLocaleString()}
              <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-2)' }}>
                {' '}
                / {goal.toLocaleString()}
              </span>
            </div>
            <div style={{ color: 'var(--text-2)', fontSize: 13.5, marginTop: 4 }}>
              {log.steps == null
                ? 'Nothing logged today'
                : walked >= goal
                  ? 'Goal reached'
                  : `${(goal - walked).toLocaleString()} to go`}
            </div>
            {log.steps != null && (
              <div style={{ color: 'var(--text-3)', fontSize: 12.5, marginTop: 2 }}>
                About {km.toFixed(1)} km, from your height
              </div>
            )}
          </div>
        </div>

        <div className="section-label">Log today</div>
        <div className="card" style={{ paddingBottom: 12 }}>
          <div style={{ display: 'flex', gap: 8, padding: '12px 16px 2px' }}>
            <input
              className="input input--boxed"
              inputMode="numeric"
              placeholder="Step count"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && commit()}
              style={{ flex: 1 }}
            />
            <button className="btn btn--primary" onClick={commit} disabled={!typed.trim()}>
              Save
            </button>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: '10px 16px 2px' }}>
            {[1000, 2500, 5000].map((n) => (
              <button key={n} className="fpill" onClick={() => setSteps(date, walked + n)}>
                +{n.toLocaleString()}
              </button>
            ))}
            {log.steps != null && (
              <button className="textbtn" onClick={() => setSteps(date, null)}>
                Clear
              </button>
            )}
          </div>
        </div>

        <div className="section-label">This week</div>
        <div className="card" style={{ paddingTop: 10, paddingBottom: 6 }}>
          <BarChart
            bars={week.map((d) => ({
              label: weekdayInitial(d),
              value: dayLog(d).steps ?? 0,
            }))}
            goal={goal}
            color="var(--steps)"
            overIsBad={false}
          />
          <Row
            title="Average a day"
            value={avg == null ? 'No days logged' : Math.round(avg).toLocaleString()}
          />
          <Row title="Best day" value={best == null ? '-' : best.toLocaleString()} />
          <Row title="Days recorded" value={`${recorded.length} of 7`} />
        </div>

        <div className="section-label">Target</div>
        <div className="card">
          <Row
            title="Daily target"
            value={goal.toLocaleString()}
            right={
              <span style={{ display: 'flex', gap: 6 }}>
                <button
                  className="btn btn--ghost"
                  onClick={() => saveProfile({ stepGoal: Math.max(1000, goal - 1000) })}
                  aria-label="Lower target"
                >
                  −
                </button>
                <button
                  className="btn btn--ghost"
                  onClick={() => saveProfile({ stepGoal: Math.min(40000, goal + 1000) })}
                  aria-label="Raise target"
                >
                  +
                </button>
              </span>
            }
          />
        </div>

        <div style={{ height: 24 }} />
      </div>
    </>
  )
}

/** Yesterday's key, for the "log last night" shortcut. */
export function yesterday(): string {
  return addDays(today(), -1)
}
