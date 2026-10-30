import { useMemo, useState } from 'react'
import type { ActivityLevel, BodyType, CustomPlan, GoalKind, MacroMode, MacroSplit } from '../types'
import { useApp } from '../state/store'
import { Row, SaveBar, SegmentedField, SelectField, TopBar } from '../components/ui'
import { PlanSummary } from '../components/PlanSummary'
import {
  ACTIVITY_DESCRIPTIONS,
  ACTIVITY_LABELS,
  BODY_TYPES,
  GOAL_DESCRIPTIONS,
  GOAL_LABELS,
  KCAL_PER_LB,
  customPlanTargets,
  proteinTarget,
  resolvePlan,
  weeksToGoal,
  calorieMinimum,
} from '../lib/nutrition'
import { normalizeCustomPlan, rebalanceSplit } from '../lib/planEditor'
import { cal, weight as fmtWeight } from '../lib/format'
import {
  displayToLb,
  displayToMl,
  formatHeight,
  lbToDisplay,
  mlToDisplay,
  waterUnitLabel,
} from '../lib/units'

/**
 * Your plan: the targets, and the switch between the recommended ones and
 * your own.
 *
 * Recommended is computed from the profile and cannot be edited figure by
 * figure, because every figure follows from the goal, the body and the
 * activity below. Custom is yours: calories, the macros as either shares or
 * grams, and water, held as a draft until Save. The switch at the top is
 * immediate in both directions and loses nothing: the custom numbers stay
 * stored while Recommended is on, so coming back to them is one tap.
 */
export function Goals() {
  const app = useApp()
  const { pop, profile, settings, saveProfile, age, plan, latestWeight, push } = app

  const unit = settings.weightUnit
  const wUnit = settings.waterUnit
  const show = (lb: number) => fmtWeight(lbToDisplay(lb, unit))
  const weeks = weeksToGoal(latestWeight, profile.goalWeight, profile.goal.rate)
  const custom = profile.planMode === 'custom'
  /* `plan` is whatever is in force, so while Custom is on it is the custom
     plan. The recommended one is still needed beside it, as the thing to
     compare against and to copy from. */
  const recommended = useMemo(
    () => (custom ? resolvePlan({ ...profile, planMode: 'standard' }, age, latestWeight) : plan),
    [custom, profile, age, latestWeight, plan],
  )
  const waterText = (ml: number) =>
    `${Math.round(mlToDisplay(ml, wUnit) * 10) / 10} ${waterUnitLabel(wUnit)}`

  /* The custom plan is edited as a draft and committed by the save bar, the
     same as the other settings screens: a mistyped digit should not already be
     on the account before it can be corrected. */
  const [draft, setDraft] = useState<CustomPlan>(() => normalizeCustomPlan(profile.customPlan))
  const [waterInput, setWaterInput] = useState(() =>
    String(Math.round(mlToDisplay(profile.customPlan.waterMl, wUnit) * 10) / 10),
  )
  const draftWaterMl = displayToMl(parseFloat(waterInput) || 0, wUnit)
  const live = normalizeCustomPlan({ ...draft, waterMl: draftWaterMl })
  const dirty = JSON.stringify(live) !== JSON.stringify(normalizeCustomPlan(profile.customPlan))
  const preview = custom ? customPlanTargets(live) : plan
  const previewWater = custom ? live.waterMl : plan.waterMl

  const mode: MacroMode = draft.macroMode ?? 'percent'
  const grams = draft.macroGrams ?? customPlanTargets(draft).macros

  function setMode(next: MacroMode) {
    /* Carry the current plan across so the other mode opens on the same
       numbers, then let the user move from there. */
    const t = customPlanTargets(live)
    setDraft({
      ...draft,
      macroMode: next,
      calories: t.calories,
      macroSplit: t.split,
      macroGrams: t.macros,
    })
  }

  function setSplit(key: keyof MacroSplit, value: number) {
    setDraft({ ...draft, macroSplit: rebalanceSplit(draft.macroSplit, key, value) })
  }

  function setGrams(key: keyof MacroSplit, text: string) {
    setDraft({ ...draft, macroGrams: { ...grams, [key]: parseFloat(text) || 0 } })
  }

  function useRecommended() {
    setDraft({
      calories: recommended.calories,
      macroSplit: recommended.split,
      waterMl: recommended.waterMl,
      macroMode: mode,
      macroGrams: recommended.macros,
    })
    setWaterInput(String(Math.round(mlToDisplay(recommended.waterMl, wUnit) * 10) / 10))
  }

  const rateOptions =
    profile.goal.kind === 'gain-muscle' ? [0.25, 0.5, 0.75, 1] : [-0.5, -1, -1.5, -2]

  const macroRows = [
    { key: 'carbs', label: 'Carbohydrates', color: 'var(--carbs)' },
    { key: 'protein', label: 'Protein', color: 'var(--protein)' },
    { key: 'fat', label: 'Fat', color: 'var(--fat)' },
  ] as const

  return (
    <>
      <TopBar title="Your plan" onBack={pop} solid />
      <div className="scroll">
        <div style={{ height: 12 }} />
        <div className="card">
          <SegmentedField
            label="Targets"
            sub={
              custom
                ? 'Your own numbers. Switch back any time.'
                : 'Calculated from your goal, body and activity'
            }
            value={custom ? 'custom' : 'standard'}
            options={[
              { value: 'standard', label: 'Recommended' },
              { value: 'custom', label: 'Custom' },
            ]}
            onChange={(v) => saveProfile({ planMode: v })}
          />
        </div>

        <div className="card">
          <div style={{ padding: '18px 16px 16px' }}>
            <PlanSummary
              calories={preview.calories}
              macros={preview.macros}
              split={preview.split}
              water={waterText(previewWater)}
            />
          </div>
        </div>

        {custom ? (
          <>
            <div className="section-label">Edit your targets</div>
            <div className="card">
              {mode === 'percent' ? (
                <label className="field">
                  <span className="field__label">Daily calories</span>
                  <span className="field__control">
                    <input
                      className="input"
                      type="number"
                      inputMode="numeric"
                      value={draft.calories || ''}
                      onChange={(e) =>
                        setDraft({ ...draft, calories: parseInt(e.target.value) || 0 })
                      }
                    />
                    <span className="unit">cal</span>
                  </span>
                </label>
              ) : (
                <Row
                  title="Daily calories"
                  sub="Adds up from the grams below"
                  value={cal(preview.calories)}
                />
              )}

              <SegmentedField
                label="Set macros by"
                value={mode}
                options={[
                  { value: 'percent', label: 'Percent' },
                  { value: 'grams', label: 'Grams' },
                ]}
                onChange={setMode}
              />

              {mode === 'percent' ? (
                <div style={{ padding: '6px 16px 14px', display: 'grid', gap: 14 }}>
                  {macroRows.map((r) => (
                    <div key={r.key} style={{ display: 'grid', gap: 4 }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                        <span className="dot" style={{ background: r.color, alignSelf: 'center' }} />
                        <span style={{ flex: 1, fontSize: 14.5, fontWeight: 600 }}>{r.label}</span>
                        <span className="num" style={{ fontSize: 13.5, color: 'var(--text-2)' }}>
                          {preview.macros[r.key]} g
                        </span>
                        <span
                          className="num"
                          style={{ fontSize: 16, fontWeight: 800, color: r.color, minWidth: 44, textAlign: 'right' }}
                        >
                          {draft.macroSplit[r.key]}%
                        </span>
                      </div>
                      <input
                        className="range"
                        type="range"
                        min={0}
                        max={100}
                        step={1}
                        value={draft.macroSplit[r.key]}
                        aria-label={`${r.label} percent`}
                        style={{ accentColor: r.color } as React.CSSProperties}
                        onChange={(e) => setSplit(r.key, parseInt(e.target.value))}
                      />
                    </div>
                  ))}
                  <div className="hint" style={{ padding: 0 }}>
                    Drag one and the other two share what is left. They always add up to 100.
                  </div>
                </div>
              ) : (
                <>
                  {macroRows.map((r) => (
                    <label className="field" key={r.key}>
                      <span className="field__label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span className="dot" style={{ background: r.color }} />
                        {r.label}
                      </span>
                      <span className="field__control">
                        <input
                          className="input"
                          type="number"
                          inputMode="numeric"
                          value={grams[r.key] || ''}
                          placeholder="0"
                          onChange={(e) => setGrams(r.key, e.target.value)}
                        />
                        <span className="unit">g</span>
                      </span>
                    </label>
                  ))}
                  <div className="hint">
                    Carbohydrate and protein count 4 calories a gram, fat 9. The calorie
                    target follows from what you enter here.
                  </div>
                </>
              )}

              <label className="field">
                <span className="field__label">Water</span>
                <span className="field__control">
                  <input
                    className="input"
                    type="number"
                    inputMode="decimal"
                    value={waterInput}
                    onChange={(e) => setWaterInput(e.target.value)}
                  />
                  <span className="unit">{waterUnitLabel(wUnit)}</span>
                </span>
              </label>
            </div>

            <div className="btn-wrap" style={{ paddingTop: 4 }}>
              <button className="btn btn--ghost" onClick={useRecommended}>
                Start from the recommended numbers
              </button>
            </div>
            <div className="hint">
              Recommended right now: {cal(recommended.calories)} cal, {recommended.macros.carbs} g
              carbs, {recommended.macros.protein} g protein, {recommended.macros.fat} g fat,{' '}
              {waterText(recommended.waterMl)} water.
            </div>
          </>
        ) : (
          <>
            <div className="section-label">Targets</div>
            <div className="card">
              <Row title="Daily calories" sub="Maintenance, adjusted for your pace" value={cal(plan.calories)} />
              <Row title="Carbohydrates" sub={`${plan.split.carbs}% · what is left after protein and fat`} value={`${plan.macros.carbs} g`} />
              <Row title="Protein" sub={`${plan.split.protein}% · from your lean mass`} value={`${plan.macros.protein} g`} />
              <Row title="Fat" sub={`${plan.split.fat}% · a floor of 20% of calories`} value={`${plan.macros.fat} g`} />
              <Row title="Water" sub="From weight, height, age and activity" value={waterText(plan.waterMl)} />
            </div>
            <div className="hint">
              To change any of these by hand, switch to Custom at the top. Changing your
              goal, body or activity below changes them too.
            </div>
          </>
        )}

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
            {BODY_TYPES.find((b) => b.key === profile.bodyType)?.description}, sets your
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
        <div className="section-label">How the recommended plan is calculated</div>
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
          <Row title="Recommended target" value={cal(recommended.calories)} />
        </div>

        {recommended.belowMinimum && (
          <div className="hint" style={{ color: 'var(--warning)', fontWeight: 600 }}>
            This target is under {cal(calorieMinimum(profile))} calories a day, which is not
            a pace we would recommend.
          </div>
        )}

        <div className="hint">
          Activity level covers everyday movement only. Logged exercise is added back to
          the day, and also raises your water target.
        </div>
      </div>

      {custom && (
        <SaveBar
          disabled={!dirty}
          onSave={() => {
            saveProfile({ customPlan: live })
            setDraft(live)
          }}
        />
      )}
    </>
  )
}
