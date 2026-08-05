import { useMemo, useState } from 'react'
import type { ActivityLevel, BodyType, GoalKind, Profile, Sex } from '../types'
import { useApp } from '../state/store'
import { Icon } from '../components/Icon'
import { TriRing } from '../components/charts'
import {
  ACTIVITY_DESCRIPTIONS,
  ACTIVITY_LABELS,
  BODY_TYPES,
  GOAL_DESCRIPTIONS,
  GOAL_LABELS,
  age as ageOf,
  resolvePlan,
  weeksToGoal,
} from '../lib/nutrition'
import { cal } from '../lib/format'
import { PROTOCOL_BY_KEY, recommendFast } from '../lib/fasting'
import { displayToIn, displayToLb, lbToDisplay, mlToDisplay } from '../lib/units'
import { today } from '../lib/dates'
import { defaultProfile } from '../lib/storage'

const STEPS = ['sex', 'age', 'body', 'type', 'activity', 'goal', 'target', 'plan'] as const
type Step = (typeof STEPS)[number]

/**
 * First-run setup. Order matters: identity and measurements first (they're
 * quick and uncontroversial), then intent, then the plan — so the plan lands
 * as a payoff rather than another form.
 */
export function Onboarding() {
  const { saveProfile, saveSettings, addWeight, saveFasting } = useApp()
  const [step, setStep] = useState<Step>('sex')

  const [sex, setSex] = useState<Sex>('female')
  const [name, setName] = useState('')
  const [birthDate, setBirthDate] = useState('1995-01-01')
  const [units, setUnits] = useState<'imperial' | 'metric'>('imperial')
  const [feet, setFeet] = useState('5')
  const [inches, setInches] = useState('6')
  const [cm, setCm] = useState('168')
  const [currentW, setCurrentW] = useState('150')
  const [bodyType, setBodyType] = useState<BodyType>('average')
  const [activity, setActivity] = useState<ActivityLevel>('lightly-active')
  const [goalKind, setGoalKind] = useState<GoalKind>('lose-weight')
  const [targetMode, setTargetMode] = useState<'weight' | 'delta'>('weight')
  const [goalW, setGoalW] = useState('140')
  const [delta, setDelta] = useState('10')
  const [rate, setRate] = useState(-1)
  const [customizing, setCustomizing] = useState(false)
  const [customCals, setCustomCals] = useState('')

  const idx = STEPS.indexOf(step)
  const next = () => setStep(STEPS[Math.min(STEPS.length - 1, idx + 1)])
  const back = () => setStep(STEPS[Math.max(0, idx - 1)])

  const wUnit = units === 'imperial' ? 'lb' : 'kg'
  const heightIn =
    units === 'imperial'
      ? (parseFloat(feet) || 0) * 12 + (parseFloat(inches) || 0)
      : displayToIn(parseFloat(cm) || 0, 'cm')
  const weightLb = displayToLb(parseFloat(currentW) || 0, wUnit)
  const ageYears = ageOf(birthDate)

  /** Goal weight, however the user chose to express it. */
  const goalLb = useMemo(() => {
    if (goalKind === 'maintain' || goalKind === 'recomp') return weightLb
    const d = Math.abs(parseFloat(delta) || 0)
    if (targetMode === 'delta') {
      return goalKind === 'lose-weight'
        ? weightLb - displayToLb(d, wUnit)
        : weightLb + displayToLb(d, wUnit)
    }
    return displayToLb(parseFloat(goalW) || 0, wUnit)
  }, [goalKind, targetMode, goalW, delta, weightLb, wUnit])

  const effectiveRate = goalKind === 'maintain' ? 0 : goalKind === 'recomp' ? -0.25 : rate

  const draft: Profile = {
    ...defaultProfile(),
    name,
    sex,
    birthDate,
    heightIn,
    currentWeight: weightLb,
    startWeight: weightLb,
    goalWeight: goalLb,
    bodyType,
    activityLevel: activity,
    weeklyGoal: effectiveRate as Profile['weeklyGoal'],
    goal: { kind: goalKind, targetWeight: goalLb, rate: effectiveRate },
    planMode: 'standard',
    onboarded: false,
  }

  const plan = resolvePlan(draft, ageYears, weightLb)
  const weeks = weeksToGoal(weightLb, goalLb, effectiveRate)
  const fastRec = recommendFast({ goalKind, rate: effectiveRate })

  /* Deliberately spread to the extremes — a lean bulk and an aggressive cut
     are genuinely different plans, and collapsing them into one middle option
     serves neither. */
  const rateOptions =
    goalKind === 'gain-muscle' ? [0.25, 0.5, 0.75, 1] : [-0.5, -1, -1.5, -2]

  const paceCopy = (r: number): { title: string; sub: string } => {
    if (r > 0) {
      if (r <= 0.25)
        return { title: 'Lean gain', sub: 'Slowest, and the least fat gained alongside the muscle' }
      if (r <= 0.5)
        return { title: 'Steady build', sub: 'The usual choice — noticeable in a couple of months' }
      if (r <= 0.75)
        return { title: 'Fast build', sub: 'Quicker size, but you will put on more fat with it' }
      return { title: 'Hard bulk', sub: 'Maximum surplus. Expect real fat gain and a cut afterwards' }
    }
    if (r >= -0.5)
      return { title: 'Gentle', sub: 'Barely noticeable day to day, and the easiest to sustain' }
    if (r >= -1)
      return { title: 'Steady', sub: 'The standard pace, and the one most people actually keep to' }
    if (r >= -1.5)
      return { title: 'Aggressive', sub: 'Fast, hungry, and demanding. Protein is pushed high to protect muscle' }
    return {
      title: 'Very aggressive',
      sub: 'The steepest this app will plan. Hard to sustain and easy to lose muscle on — best kept short',
    }
  }

  function finish() {
    const finalCals = customizing ? parseInt(customCals) || plan.calories : plan.calories
    saveSettings({
      weightUnit: wUnit,
      heightUnit: units === 'imperial' ? 'in' : 'cm',
    })
    saveFasting({
      protocol: fastRec.protocol,
      eatingWindowStartHour: fastRec.eatingStartHour,
    })
    saveProfile({
      ...draft,
      onboarded: true,
      planMode: customizing ? 'custom' : 'standard',
      customPlan: {
        calories: finalCals,
        macroSplit: plan.split,
        waterMl: plan.waterMl,
      },
    })
    addWeight(today(), weightLb)
  }

  const valid =
    (step !== 'body' || (heightIn > 20 && weightLb > 30)) &&
    (step !== 'target' || goalLb > 30)

  return (
    <div className="app">
      <div className="topbar">
        <div className="topbar__side">
          {idx > 0 && (
            <button className="iconbtn" onClick={back} aria-label="Back">
              <Icon name="back" size={22} strokeWidth={2.2} />
            </button>
          )}
        </div>
        <div className="topbar__title">
          {idx + 1} of {STEPS.length}
        </div>
        <div className="topbar__side topbar__side--right" />
      </div>

      <div style={{ padding: '0 16px', background: 'var(--surface)' }}>
        <div className="progress" style={{ margin: 0 }}>
          <div
            className="progress__fill"
            style={{ width: `${((idx + 1) / STEPS.length) * 100}%` }}
          />
        </div>
      </div>

      <div className="scroll">
        {step === 'sex' && (
          <Question title="Let's start with the basics" sub="This only affects the calorie estimate — the equation uses a different constant for each.">
            <div className="card" style={{ margin: '0 0 12px' }}>
              <label className="field">
                <span className="field__label">Name</span>
                <span className="field__control">
                  <input
                    className="input"
                    placeholder="Optional"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </span>
              </label>
            </div>
            {(
              [
                ['female', 'Female'],
                ['male', 'Male'],
              ] as const
            ).map(([v, label]) => (
              <Choice key={v} label={label} active={sex === v} onClick={() => setSex(v)} />
            ))}
          </Question>
        )}

        {step === 'age' && (
          <Question title="How old are you?" sub="Metabolism slows with age, so this shifts your calorie and water targets.">
            <div className="card" style={{ margin: 0 }}>
              <label className="field">
                <span className="field__label">Date of birth</span>
                <span className="field__control">
                  <input
                    className="input"
                    type="date"
                    value={birthDate}
                    onChange={(e) => setBirthDate(e.target.value)}
                  />
                </span>
              </label>
            </div>
            <div
              style={{
                textAlign: 'center',
                padding: '28px 0 0',
                fontSize: 46,
                fontWeight: 800,
                letterSpacing: '-0.04em',
              }}
              className="num"
            >
              {ageYears}
              <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-2)', letterSpacing: 0 }}>
                years old
              </div>
            </div>
          </Question>
        )}

        {step === 'body' && (
          <Question title="Your height and weight">
            <div className="chips" style={{ padding: '0 0 12px' }}>
              <button
                className={`chip ${units === 'imperial' ? 'chip--active' : ''}`}
                onClick={() => setUnits('imperial')}
              >
                lb / ft
              </button>
              <button
                className={`chip ${units === 'metric' ? 'chip--active' : ''}`}
                onClick={() => setUnits('metric')}
              >
                kg / cm
              </button>
            </div>
            <div className="card" style={{ margin: 0 }}>
              {units === 'imperial' ? (
                <div className="field">
                  <span className="field__label">Height</span>
                  <span className="field__control" style={{ gap: 10 }}>
                    <input
                      className="input"
                      type="number"
                      style={{ width: 44 }}
                      value={feet}
                      onChange={(e) => setFeet(e.target.value)}
                    />
                    <span className="unit">ft</span>
                    <input
                      className="input"
                      type="number"
                      style={{ width: 44 }}
                      value={inches}
                      onChange={(e) => setInches(e.target.value)}
                    />
                    <span className="unit">in</span>
                  </span>
                </div>
              ) : (
                <label className="field">
                  <span className="field__label">Height</span>
                  <span className="field__control">
                    <input
                      className="input"
                      type="number"
                      value={cm}
                      onChange={(e) => setCm(e.target.value)}
                    />
                    <span className="unit">cm</span>
                  </span>
                </label>
              )}
              <label className="field">
                <span className="field__label">Current weight</span>
                <span className="field__control">
                  <input
                    className="input"
                    type="number"
                    inputMode="decimal"
                    value={currentW}
                    onChange={(e) => setCurrentW(e.target.value)}
                  />
                  <span className="unit">{wUnit}</span>
                </span>
              </label>
            </div>
          </Question>
        )}

        {step === 'type' && (
          <Question
            title="Which best describes your build?"
            sub="Used to estimate lean mass, which sets your protein and water targets. Two people at the same weight can need very different amounts."
          >
            {BODY_TYPES.map((b) => (
              <Choice
                key={b.key}
                label={b.label}
                sub={b.description}
                active={bodyType === b.key}
                onClick={() => setBodyType(b.key)}
              />
            ))}
          </Question>
        )}

        {step === 'activity' && (
          <Question
            title="How active is your day?"
            sub="Everyday movement only — workouts get logged separately and added back."
          >
            {(Object.keys(ACTIVITY_LABELS) as ActivityLevel[]).map((k) => (
              <Choice
                key={k}
                label={ACTIVITY_LABELS[k]}
                sub={ACTIVITY_DESCRIPTIONS[k]}
                active={activity === k}
                onClick={() => setActivity(k)}
              />
            ))}
          </Question>
        )}

        {step === 'goal' && (
          <Question title="What are you working toward?">
            {(Object.keys(GOAL_LABELS) as GoalKind[]).map((k) => (
              <Choice
                key={k}
                label={GOAL_LABELS[k]}
                sub={GOAL_DESCRIPTIONS[k]}
                active={goalKind === k}
                onClick={() => {
                  setGoalKind(k)
                  setRate(k === 'gain-muscle' ? 0.5 : -1)
                }}
              />
            ))}
          </Question>
        )}

        {step === 'target' && (
          <Question
            title={
              goalKind === 'maintain'
                ? 'Holding steady'
                : goalKind === 'recomp'
                  ? 'Fat down, muscle up'
                  : goalKind === 'gain-muscle'
                    ? 'How much muscle?'
                    : 'How much do you want to lose?'
            }
          >
            {goalKind !== 'maintain' && goalKind !== 'recomp' && (
              <>
                <div className="chips" style={{ padding: '0 0 12px' }}>
                  <button
                    className={`chip ${targetMode === 'weight' ? 'chip--active' : ''}`}
                    onClick={() => setTargetMode('weight')}
                  >
                    Target weight
                  </button>
                  <button
                    className={`chip ${targetMode === 'delta' ? 'chip--active' : ''}`}
                    onClick={() => setTargetMode('delta')}
                  >
                    {goalKind === 'gain-muscle' ? 'Muscle to gain' : 'Pounds to lose'}
                  </button>
                </div>

                <div className="card" style={{ margin: '0 0 16px' }}>
                  {targetMode === 'weight' ? (
                    <label className="field">
                      <span className="field__label">Goal weight</span>
                      <span className="field__control">
                        <input
                          className="input"
                          type="number"
                          inputMode="decimal"
                          value={goalW}
                          onChange={(e) => setGoalW(e.target.value)}
                        />
                        <span className="unit">{wUnit}</span>
                      </span>
                    </label>
                  ) : (
                    <label className="field">
                      <span className="field__label">
                        {goalKind === 'gain-muscle' ? 'Muscle to gain' : 'Weight to lose'}
                      </span>
                      <span className="field__control">
                        <input
                          className="input"
                          type="number"
                          inputMode="decimal"
                          value={delta}
                          onChange={(e) => setDelta(e.target.value)}
                        />
                        <span className="unit">{wUnit}</span>
                      </span>
                    </label>
                  )}
                  <div className="field">
                    <span className="field__label">Ends at</span>
                    <span className="field__control">
                      <span className="num" style={{ fontWeight: 700 }}>
                        {Math.round(lbToDisplay(goalLb, wUnit) * 10) / 10} {wUnit}
                      </span>
                    </span>
                  </div>
                </div>

                <div className="section-label" style={{ padding: '0 0 8px' }}>
                  Pace
                </div>
                {rateOptions.map((r) => {
                  const c = paceCopy(r)
                  return (
                    <Choice
                      key={r}
                      label={`${c.title} — ${Math.abs(r)} ${wUnit} per week`}
                      sub={c.sub}
                      active={rate === r}
                      onClick={() => setRate(r)}
                    />
                  )
                })}
              </>
            )}

            {(goalKind === 'maintain' || goalKind === 'recomp') && (
              <div className="hint" style={{ padding: '0 0 12px' }}>
                {goalKind === 'maintain'
                  ? "We'll target your maintenance calories and keep protein high enough to hold onto muscle."
                  : "We'll sit slightly below maintenance with high protein — the weight moves slowly, the composition moves faster."}
              </div>
            )}
          </Question>
        )}

        {step === 'plan' && (
          <div style={{ padding: '22px 16px 8px' }}>
            <div style={{ textAlign: 'center', marginBottom: 18 }}>
              <div style={{ fontSize: 13.5, color: 'var(--text-2)', fontWeight: 600 }}>
                YOUR DAILY PLAN
              </div>
              <div
                className="num"
                style={{
                  fontSize: 54,
                  fontWeight: 800,
                  letterSpacing: '-0.045em',
                  lineHeight: 1.05,
                  margin: '4px 0 0',
                }}
              >
                {cal(customizing ? parseInt(customCals) || plan.calories : plan.calories)}
              </div>
              <div style={{ color: 'var(--text-2)', fontSize: 14 }}>calories per day</div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
              <TriRing
                size={150}
                rings={[
                  { label: 'Carbs', value: plan.macros.carbs, goal: plan.macros.carbs, color: 'var(--carbs)' },
                  { label: 'Fat', value: plan.macros.fat, goal: plan.macros.fat, color: 'var(--fat)' },
                  { label: 'Protein', value: plan.macros.protein, goal: plan.macros.protein, color: 'var(--protein)' },
                ]}
                center={
                  <>
                    <div className="num" style={{ fontSize: 20, fontWeight: 800 }}>
                      {plan.split.carbs}/{plan.split.fat}/{plan.split.protein}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-2)' }}>C / F / P</div>
                  </>
                }
              />
            </div>

            <div className="card card--inset" style={{ margin: '0 0 12px' }}>
              <PlanRow color="var(--carbs)" label="Carbohydrates" value={`${plan.macros.carbs} g`} />
              <PlanRow color="var(--fat)" label="Fat" value={`${plan.macros.fat} g`} />
              <PlanRow color="var(--protein)" label="Protein" value={`${plan.macros.protein} g`} />
              <PlanRow
                color="var(--water)"
                label="Water"
                value={`${Math.round(mlToDisplay(plan.waterMl, 'ml'))} ml`}
              />
            </div>

            <div className="card card--inset" style={{ margin: '0 0 12px' }}>
              <div className="row">
                <span className="row__main row__title">Maintenance</span>
                <span className="row__value">{cal(plan.maintenance)}</span>
              </div>
              {weeks && (
                <div className="row">
                  <span className="row__main row__title">Reach your goal in</span>
                  <span className="row__value">
                    about {weeks} week{weeks === 1 ? '' : 's'}
                  </span>
                </div>
              )}
            </div>

            <button
              className="btn btn--ghost"
              onClick={() => {
                setCustomizing(!customizing)
                if (!customCals) setCustomCals(String(plan.calories))
              }}
            >
              {customizing ? 'Use the calculated plan' : 'I want to set my own numbers'}
            </button>

            {customizing && (
              <div className="card card--inset" style={{ margin: '12px 0 0' }}>
                <label className="field">
                  <span className="field__label">Daily calories</span>
                  <span className="field__control">
                    <input
                      className="input"
                      type="number"
                      inputMode="numeric"
                      value={customCals}
                      onChange={(e) => setCustomCals(e.target.value)}
                    />
                  </span>
                </label>
                <div className="hint">
                  You can fine-tune macros and water in Settings, and switch back to the
                  calculated plan whenever you like.
                </div>
              </div>
            )}

            {plan.flooredCalories && (
              <div className="hint" style={{ color: 'var(--warning)', fontWeight: 600 }}>
                That pace would put you below the minimum this app will recommend, so your
                goal has been raised to {cal(plan.calories)}. Consider a slower pace, or
                speak to a clinician.
              </div>
            )}

            <div className="card card--inset" style={{ margin: '12px 0 0', textAlign: 'left' }}>
              <div className="card__head">
                <span className="card__title">Suggested fasting window</span>
                <span className="num" style={{ fontWeight: 700 }}>
                  {PROTOCOL_BY_KEY[fastRec.protocol].label}
                </span>
              </div>
              <div className="hint" style={{ padding: '12px 16px' }}>
                {fastRec.reason} You can change it, or ignore fasting entirely, from the
                Settings tab.
              </div>
            </div>

            <div className="hint">
              These are estimates from standard equations, not medical advice.
            </div>
          </div>
        )}
      </div>

      <div
        className="btn-wrap"
        style={{ background: 'var(--surface)', borderTop: '1px solid var(--border)' }}
      >
        {step === 'plan' ? (
          <button className="btn btn--ink" onClick={finish}>
            Start tracking
          </button>
        ) : (
          <button className="btn" disabled={!valid} onClick={next}>
            Continue
          </button>
        )}
      </div>
    </div>
  )
}

function PlanRow({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <div className="row">
      <span className="dot" style={{ background: color }} />
      <span className="row__main row__title">{label}</span>
      <span className="row__value">{value}</span>
    </div>
  )
}

function Question({
  title,
  sub,
  children,
}: {
  title: string
  sub?: string
  children: React.ReactNode
}) {
  return (
    <div style={{ padding: '26px 16px 8px' }}>
      <h2 style={{ fontSize: 25, letterSpacing: '-0.025em', lineHeight: 1.18 }}>{title}</h2>
      {sub ? (
        <p style={{ color: 'var(--text-2)', margin: '9px 0 22px', fontSize: 14.5, lineHeight: 1.5 }}>
          {sub}
        </p>
      ) : (
        <div style={{ height: 22 }} />
      )}
      {children}
    </div>
  )
}

function Choice({
  label,
  sub,
  active,
  onClick,
}: {
  label: string
  sub?: string
  active: boolean
  onClick(): void
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        width: '100%',
        textAlign: 'left',
        padding: '15px 16px',
        marginBottom: 10,
        borderRadius: 'var(--r-md)',
        border: `1.5px solid ${active ? 'var(--accent)' : 'var(--border-strong)'}`,
        background: active ? 'var(--accent-soft)' : 'var(--surface)',
        transition: 'border-color .15s, background .15s',
      }}
    >
      <span style={{ flex: 1, minWidth: 0 }}>
        <span
          style={{
            display: 'block',
            fontWeight: 600,
            color: active ? 'var(--accent)' : 'var(--text)',
          }}
        >
          {label}
        </span>
        {sub && (
          <span
            style={{
              display: 'block',
              fontSize: 12.5,
              color: 'var(--text-2)',
              marginTop: 3,
              lineHeight: 1.45,
            }}
          >
            {sub}
          </span>
        )}
      </span>
      {active && (
        <span style={{ color: 'var(--accent)', display: 'flex', flex: 'none' }}>
          <Icon name="check" size={20} strokeWidth={2.6} />
        </span>
      )}
    </button>
  )
}
