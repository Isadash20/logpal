import { useState } from 'react'
import type { ActivityLevel, BodyType, GoalKind } from '../types'
import { useApp } from '../state/store'
import { Dialog, Row, SelectField, TopBar } from '../components/ui'
import { Donut, Legend } from '../components/charts'
import {
  ACTIVITY_DESCRIPTIONS,
  ACTIVITY_LABELS,
  BODY_TYPES,
  GOAL_DESCRIPTIONS,
  GOAL_LABELS,
  KCAL_PER_LB,
  proteinTarget,
  weeksToGoal,
} from '../lib/nutrition'
import { cal, weight as fmtWeight } from '../lib/format'
import { displayToLb, formatHeight, lbToDisplay, mlToDisplay, waterUnitLabel } from '../lib/units'

export function Goals() {
  const app = useApp()
  const { pop, profile, settings, saveProfile, age, plan, latestWeight, push } = app
  const [macroOpen, setMacroOpen] = useState(false)

  const unit = settings.weightUnit
  const show = (lb: number) => fmtWeight(lbToDisplay(lb, unit))
  const weeks = weeksToGoal(latestWeight, profile.goalWeight, profile.goal.rate)
  const custom = profile.planMode === 'custom'

  const macroSlices = [
    { label: 'Carbohydrates', value: plan.macros.carbs * 4, color: 'var(--carbs)' },
    { label: 'Fat', value: plan.macros.fat * 9, color: 'var(--fat)' },
    { label: 'Protein', value: plan.macros.protein * 4, color: 'var(--protein)' },
  ]

  const rateOptions =
    profile.goal.kind === 'gain-muscle' ? [0.25, 0.5, 0.75, 1] : [-0.5, -1, -1.5, -2]

  return (
    <>
      <TopBar title="Goals" onBack={pop} />
      <div className="scroll">
        <div className="card">
          <div
            style={{ display: 'flex', gap: 14, alignItems: 'center', padding: '20px 16px' }}
          >
            <Donut
              size={124}
              thickness={22}
              slices={macroSlices}
              center={
                <>
                  <div className="num" style={{ fontSize: 22, fontWeight: 800 }}>
                    {cal(plan.calories)}
                  </div>
                  <div style={{ fontSize: 10.5, color: 'var(--text-2)' }}>cal / day</div>
                </>
              }
            />
            <Legend slices={macroSlices} unit=" cal" />
          </div>
        </div>

        <div className="section-label">Targets</div>
        <div className="card">
          <Row
            title="Daily calories"
            sub={custom ? 'Set by you' : 'Calculated from your goal'}
            value={cal(plan.calories)}
            chevron
            onClick={() => push({ name: 'planHub' })}
          />
          <Row title="Carbohydrates" sub={`${plan.split.carbs}%`} value={`${plan.macros.carbs} g`} onClick={custom ? undefined : () => setMacroOpen(true)} chevron={!custom} />
          <Row title="Fat" sub={`${plan.split.fat}%`} value={`${plan.macros.fat} g`} onClick={custom ? undefined : () => setMacroOpen(true)} chevron={!custom} />
          <Row title="Protein" sub={`${plan.split.protein}%`} value={`${plan.macros.protein} g`} onClick={custom ? undefined : () => setMacroOpen(true)} chevron={!custom} />
          <Row
            title="Water"
            sub={profile.waterGoalOverrideMl ? 'Overridden' : 'From weight, height, age and activity'}
            value={`${Math.round(mlToDisplay(plan.waterMl, settings.waterUnit))} ${waterUnitLabel(settings.waterUnit)}`}
          />
        </div>

        <div className="section-label">Goal</div>
        <div className="card">
          <SelectField
            label="I want to"
            value={profile.goal.kind}
            onChange={(v) =>
              saveProfile({
                goal: {
                  ...profile.goal,
                  kind: v as GoalKind,
                  rate: v === 'maintain' ? 0 : v === 'recomp' ? -0.25 : v === 'gain-muscle' ? 0.5 : -1,
                },
              })
            }
            options={(Object.keys(GOAL_LABELS) as GoalKind[]).map((k) => ({
              value: k,
              label: GOAL_LABELS[k],
            }))}
          />
          <div className="hint">{GOAL_DESCRIPTIONS[profile.goal.kind]}</div>

          <Row title="Starting weight" value={`${show(profile.startWeight)} ${unit}`} />
          <Row
            title="Current weight"
            value={`${show(latestWeight)} ${unit}`}
            chevron
            onClick={() => push({ name: 'weightEntry' })}
          />
          <label className="field">
            <span className="field__label">Goal weight</span>
            <span className="field__control">
              <input
                className="input"
                type="number"
                inputMode="decimal"
                step="0.1"
                value={Math.round(lbToDisplay(profile.goalWeight, unit) * 10) / 10}
                onChange={(e) => {
                  const v = parseFloat(e.target.value)
                  if (Number.isFinite(v)) {
                    const lb = displayToLb(v, unit)
                    saveProfile({
                      goalWeight: lb,
                      goal: { ...profile.goal, targetWeight: lb },
                    })
                  }
                }}
              />
              <span className="unit">{unit}</span>
            </span>
          </label>

          {profile.goal.kind !== 'maintain' && profile.goal.kind !== 'recomp' && (
            <SelectField
              label="Pace"
              value={profile.goal.rate}
              onChange={(v) =>
                saveProfile({
                  goal: { ...profile.goal, rate: v as number },
                  weeklyGoal: v as never,
                })
              }
              options={rateOptions.map((r) => ({
                value: r,
                label: `${Math.abs(r)} ${unit} per week`,
              }))}
            />
          )}

          {weeks && (
            <Row
              title="At this pace"
              value={`about ${weeks} week${weeks === 1 ? '' : 's'}`}
            />
          )}
        </div>

        <div className="section-label">Body</div>
        <div className="card">
          <SelectField
            label="Build"
            value={profile.bodyType}
            onChange={(v) => saveProfile({ bodyType: v as BodyType })}
            options={BODY_TYPES.map((b) => ({ value: b.key, label: b.label }))}
          />
          <div className="hint">
            {BODY_TYPES.find((b) => b.key === profile.bodyType)?.description} — sets your
            estimated lean mass, which drives protein ({proteinTarget(profile, latestWeight)} g)
            and water.
          </div>
          <SelectField
            label="Activity level"
            value={profile.activityLevel}
            onChange={(v) => saveProfile({ activityLevel: v as ActivityLevel })}
            options={(Object.keys(ACTIVITY_LABELS) as ActivityLevel[]).map((k) => ({
              value: k,
              label: ACTIVITY_LABELS[k],
            }))}
          />
          <div className="hint">{ACTIVITY_DESCRIPTIONS[profile.activityLevel]}</div>
        </div>

        <div className="section-label">Fitness</div>
        <div className="card">
          <label className="field">
            <span className="field__label">Workouts per week</span>
            <span className="field__control">
              <input
                className="input"
                type="number"
                inputMode="numeric"
                value={profile.workoutsPerWeek}
                onChange={(e) => saveProfile({ workoutsPerWeek: parseInt(e.target.value) || 0 })}
              />
            </span>
          </label>
          <label className="field">
            <span className="field__label">Minutes per workout</span>
            <span className="field__control">
              <input
                className="input"
                type="number"
                inputMode="numeric"
                value={profile.minutesPerWorkout}
                onChange={(e) => saveProfile({ minutesPerWorkout: parseInt(e.target.value) || 0 })}
              />
            </span>
          </label>
        </div>

        {/* The arithmetic, shown rather than hidden. */}
        <div className="section-label">How this is calculated</div>
        <div className="card">
          <Row
            title="BMR"
            sub={`Mifflin-St Jeor · ${profile.sex}, ${age} yr, ${formatHeight(profile.heightIn, settings.heightUnit)}`}
            value={cal(plan.bmr)}
          />
          <Row
            title="Maintenance"
            sub={`BMR × ${ACTIVITY_LABELS[profile.activityLevel]}`}
            value={cal(plan.maintenance)}
          />
          <Row
            title="Goal adjustment"
            sub={`${profile.goal.rate} ${unit}/wk × ${KCAL_PER_LB} ÷ 7`}
            value={cal((profile.goal.rate * KCAL_PER_LB) / 7)}
          />
          <Row title="Daily target" value={cal(plan.calories)} />
        </div>

        {plan.flooredCalories && (
          <div className="hint" style={{ color: 'var(--warning)', fontWeight: 600 }}>
            Your pace would drop below the minimum this app recommends, so the target was
            raised to {cal(plan.calories)}. A slower pace is easier to sustain — worth
            running past a clinician first.
          </div>
        )}

        <div className="hint">
          Activity level covers everyday movement only. Logged exercise is added back to
          the day, and also raises your water target.
        </div>
      </div>

      {macroOpen && <MacroDialog onClose={() => setMacroOpen(false)} />}
    </>
  )
}

/** Switching to custom is the only way to hand-set macros. */
function MacroDialog({ onClose }: { onClose(): void }) {
  const { plan, saveProfile, profile } = useApp()

  return (
    <Dialog title="Macro split" onClose={onClose}>
      <div className="hint" style={{ padding: '0 0 12px' }}>
        On the calculated plan, protein is anchored to your lean mass and fat is held at a
        minimum of 20% of calories — carbs take the remainder. Switch to a custom plan to
        set the percentages yourself.
      </div>
      <div style={{ display: 'grid', gap: 8, marginBottom: 16 }}>
        {(
          [
            ['Carbohydrates', plan.split.carbs, plan.macros.carbs, 'var(--carbs)'],
            ['Fat', plan.split.fat, plan.macros.fat, 'var(--fat)'],
            ['Protein', plan.split.protein, plan.macros.protein, 'var(--protein)'],
          ] as [string, number, number, string][]
        ).map(([label, p, g, color]) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="dot" style={{ background: color }} />
            <span style={{ flex: 1, fontSize: 14 }}>{label}</span>
            <span className="num" style={{ fontSize: 14, fontWeight: 600 }}>
              {p}% · {g} g
            </span>
          </div>
        ))}
      </div>
      <button
        className="btn"
        onClick={() => {
          saveProfile({
            planMode: 'custom',
            customPlan: {
              calories: plan.calories,
              macroSplit: plan.split,
              waterMl: plan.waterMl,
            },
          })
          onClose()
        }}
      >
        Switch to a custom plan
      </button>
      {profile.planMode === 'custom' && (
        <button className="btn btn--ghost" style={{ marginTop: 8 }} onClick={onClose}>
          Close
        </button>
      )}
    </Dialog>
  )
}
