import { useState } from 'react'
import { type Sex } from '../types'
import { useApp } from '../state/store'
import { Dialog, Row, SelectField, Toggle, TopBar } from '../components/ui'
import { SEED_FOODS } from '../data/seedFoods'
import { displayToIn, inToDisplay, splitFeetInches } from '../lib/units'
import { cal } from '../lib/format'

export function Settings() {
  const app = useApp()
  const { pop, settings, profile, saveSettings, saveProfile, data, resetAll } = app
  const [confirmReset, setConfirmReset] = useState(false)
  const { feet, inches } = splitFeetInches(profile.heightIn)

  return (
    <>
      <TopBar title="Settings" onBack={pop} />
      <div className="scroll">
        <div className="section-label">Profile</div>
        <div className="card">
          <label className="field">
            <span className="field__label">Name</span>
            <span className="field__control">
              <input
                className="input"
                value={profile.name}
                placeholder="Optional"
                onChange={(e) => saveProfile({ name: e.target.value })}
              />
            </span>
          </label>
          <SelectField
            label="Sex"
            value={profile.sex}
            onChange={(v) => saveProfile({ sex: v as Sex })}
            options={[
              { value: 'female', label: 'Female' },
              { value: 'male', label: 'Male' },
            ]}
          />
          <label className="field">
            <span className="field__label">Date of Birth</span>
            <span className="field__control">
              <input
                className="input"
                type="date"
                value={profile.birthDate}
                onChange={(e) => saveProfile({ birthDate: e.target.value })}
              />
            </span>
          </label>

          {settings.heightUnit === 'in' ? (
            <div className="field">
              <span className="field__label">Height</span>
              <span className="field__control" style={{ gap: 10 }}>
                <input
                  className="input"
                  type="number"
                  inputMode="numeric"
                  style={{ width: 44 }}
                  value={feet}
                  onChange={(e) =>
                    saveProfile({ heightIn: (parseInt(e.target.value) || 0) * 12 + inches })
                  }
                />
                <span className="unit">ft</span>
                <input
                  className="input"
                  type="number"
                  inputMode="numeric"
                  style={{ width: 44 }}
                  value={inches}
                  onChange={(e) =>
                    saveProfile({ heightIn: feet * 12 + (parseInt(e.target.value) || 0) })
                  }
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
                  inputMode="numeric"
                  value={Math.round(inToDisplay(profile.heightIn, 'cm'))}
                  onChange={(e) =>
                    saveProfile({ heightIn: displayToIn(parseFloat(e.target.value) || 0, 'cm') })
                  }
                />
                <span className="unit">cm</span>
              </span>
            </label>
          )}
        </div>

        <div className="section-label">Units</div>
        <div className="card">
          <SelectField
            label="Weight"
            value={settings.weightUnit}
            onChange={(v) => saveSettings({ weightUnit: v })}
            options={[
              { value: 'lb', label: 'Pounds (lb)' },
              { value: 'kg', label: 'Kilograms (kg)' },
            ]}
          />
          <SelectField
            label="Height"
            value={settings.heightUnit}
            onChange={(v) => saveSettings({ heightUnit: v })}
            options={[
              { value: 'in', label: 'Feet & Inches' },
              { value: 'cm', label: 'Centimetres' },
            ]}
          />
          <SelectField
            label="Water"
            value={settings.waterUnit}
            onChange={(v) => saveSettings({ waterUnit: v })}
            options={[
              { value: 'cup', label: 'Cups' },
              { value: 'floz', label: 'Fluid Ounces' },
              { value: 'ml', label: 'Millilitres' },
            ]}
          />
        </div>

        {/* Standard vs custom. Both sets of numbers persist, so flipping back
            and forth never loses what the user typed. */}
        <div className="section-label">Your plan</div>
        <div className="card">
          <SelectField
            label="Plan"
            value={profile.planMode}
            onChange={(v) => saveProfile({ planMode: v })}
            options={[
              { value: 'standard', label: 'Calculated for me' },
              { value: 'custom', label: 'I set my own numbers' },
            ]}
          />
          {profile.planMode === 'custom' ? (
            <>
              <label className="field">
                <span className="field__label">Daily calories</span>
                <span className="field__control">
                  <input
                    className="input"
                    type="number"
                    inputMode="numeric"
                    value={profile.customPlan.calories}
                    onChange={(e) =>
                      saveProfile({
                        customPlan: {
                          ...profile.customPlan,
                          calories: parseInt(e.target.value) || 0,
                        },
                      })
                    }
                  />
                </span>
              </label>
              {(['carbs', 'fat', 'protein'] as const).map((k) => (
                <label className="field" key={k}>
                  <span className="field__label" style={{ textTransform: 'capitalize' }}>
                    {k} %
                  </span>
                  <span className="field__control">
                    <input
                      className="input"
                      type="number"
                      inputMode="numeric"
                      value={profile.customPlan.macroSplit[k]}
                      onChange={(e) =>
                        saveProfile({
                          customPlan: {
                            ...profile.customPlan,
                            macroSplit: {
                              ...profile.customPlan.macroSplit,
                              [k]: parseInt(e.target.value) || 0,
                            },
                          },
                        })
                      }
                    />
                  </span>
                </label>
              ))}
              <label className="field">
                <span className="field__label">Water</span>
                <span className="field__control">
                  <input
                    className="input"
                    type="number"
                    inputMode="numeric"
                    value={profile.customPlan.waterMl}
                    onChange={(e) =>
                      saveProfile({
                        customPlan: {
                          ...profile.customPlan,
                          waterMl: parseInt(e.target.value) || 0,
                        },
                      })
                    }
                  />
                  <span className="unit">ml</span>
                </span>
              </label>
              {(() => {
                const t =
                  profile.customPlan.macroSplit.carbs +
                  profile.customPlan.macroSplit.fat +
                  profile.customPlan.macroSplit.protein
                return t !== 100 ? (
                  <div className="hint" style={{ color: 'var(--danger)', fontWeight: 600 }}>
                    Macros total {t}% — they need to add up to 100%.
                  </div>
                ) : null
              })()}
            </>
          ) : (
            <>
              <Row title="Daily calories" value={cal(app.plan.calories)} />
              <Row title="Maintenance" value={cal(app.plan.maintenance)} />
              <Row title="Water" value={`${app.plan.waterMl} ml`} />
              <Row title="Goals" chevron onClick={() => app.push({ name: 'goals' })} />
            </>
          )}
        </div>

        <div className="section-label">Diary</div>
        <div className="card">
          <label className="field">
            <span className="field__label">Water goal override</span>
            <span className="field__control">
              <input
                className="input"
                type="number"
                inputMode="numeric"
                placeholder={String(app.plan.waterMl)}
                value={profile.waterGoalOverrideMl ?? ''}
                onChange={(e) =>
                  saveProfile({
                    waterGoalOverrideMl: e.target.value ? parseInt(e.target.value) : undefined,
                  })
                }
              />
              <span className="unit">ml</span>
            </span>
          </label>
          <Toggle
            label="Add exercise calories to daily goal"
            sub="When on, calories burned increase the amount you can eat that day."
            checked={settings.exerciseAddsCalories}
            onChange={(v) => saveSettings({ exerciseAddsCalories: v })}
          />
        </div>

        <div className="section-label">Food Database</div>
        <div className="card">
          <Toggle
            label="Search Open Food Facts"
            sub="Adds millions of packaged products and enables barcode lookup. Requires a connection."
            checked={settings.useOpenFoodFacts}
            onChange={(v) => saveSettings({ useOpenFoodFacts: v })}
          />
          <Row title="Built-in foods" value={SEED_FOODS.length} />
          <Row title="Your custom foods" value={data.customFoods.length} />
          <Row title="Cached online foods" value={Object.keys(data.foodCache).length} />
        </div>

        <div className="section-label">Appearance</div>
        <div className="card">
          <SelectField
            label="Theme"
            value={settings.theme}
            onChange={(v) => saveSettings({ theme: v })}
            options={[
              { value: 'system', label: 'Match System' },
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
            ]}
          />
        </div>

        <div className="section-label">Data</div>
        <div className="card">
          <Row title="Food entries" value={data.foodEntries.length} />
          <Row title="Exercise entries" value={data.exerciseEntries.length} />
          <Row title="Weight entries" value={data.weights.length} />
          <Row
            title="Total calories logged"
            value={cal(data.foodEntries.reduce((s, e) => s + e.nutrients.calories, 0))}
          />
          <Row title="Export Data" chevron onClick={() => exportJson(data)} />
        </div>

        <div className="btn-wrap">
          <button className="btn btn--danger" onClick={() => setConfirmReset(true)}>
            Reset All Data
          </button>
        </div>

        <div className="hint">
          Everything is stored locally in this browser. Clearing site data or switching
          devices starts you over — export first if that matters.
        </div>
      </div>

      {confirmReset && (
        <Dialog title="Reset everything?" onClose={() => setConfirmReset(false)}>
          <div style={{ color: 'var(--text-2)', marginBottom: 16, fontSize: 14 }}>
            This permanently deletes your diary, weight history, custom foods, recipes and
            goals from this browser. It can&apos;t be undone.
          </div>
          <button
            className="btn btn--danger"
            onClick={() => {
              resetAll()
              setConfirmReset(false)
            }}
          >
            Delete Everything
          </button>
          <button
            className="btn btn--ghost"
            style={{ marginTop: 8 }}
            onClick={() => setConfirmReset(false)}
          >
            Cancel
          </button>
        </Dialog>
      )}
    </>
  )
}

function exportJson(data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `logpal-export-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

/* ------------------------------------------------------------------ more -- */

export function More() {
  const { push, profile, settings, data, calorieTarget } = useApp()

  return (
    <>
      <TopBar title="More" />
      <div className="scroll">
        <div
          style={{
            padding: '22px 16px',
            background: 'var(--surface)',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            gap: 14,
          }}
        >
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 999,
              background: 'var(--accent-soft)',
              color: 'var(--accent)',
              display: 'grid',
              placeContent: 'center',
              fontWeight: 800,
              fontSize: 20,
              flex: 'none',
            }}
          >
            {(profile.name || 'You').slice(0, 1).toUpperCase()}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{profile.name || 'Your Profile'}</div>
            <div style={{ color: 'var(--text-2)', fontSize: 13.5 }}>
              {cal(calorieTarget)} cal/day · {data.foodEntries.length} entries logged
            </div>
          </div>
        </div>

        <div className="section-label">Foods</div>
        <div className="card">
          <Row title="My Meals" value={data.savedMeals.length} chevron onClick={() => push({ name: 'meals' })} />
          <Row
            title="My Recipes"
            value={data.recipes.length}
            chevron
            onClick={() => push({ name: 'recipes' })}
          />
          <Row
            title="My Foods"
            value={data.customFoods.length}
            chevron
            onClick={() => push({ name: 'myFoods' })}
          />
        </div>

        <div className="section-label">Plan</div>
        <div className="card">
          <Row title="Intermittent fasting" chevron onClick={() => push({ name: 'fasting' })} />
          <Row title="Goals" chevron onClick={() => push({ name: 'goals' })} />
          <Row title="Settings" chevron onClick={() => push({ name: 'settings' })} />
        </div>

        <div className="section-label">About</div>
        <div className="card">
          <Row title="Version" value="0.1.0" />
          <Row title="Theme" value={settings.theme} />
          <Row title="Food data" value="Built-in + Open Food Facts" />
        </div>

        <div className="hint">
          Food data comes from a built-in database compiled from USDA FoodData Central and
          published nutrition panels, plus Open Food Facts for packaged products. Calorie
          goals use the Mifflin-St Jeor equation. None of this is medical advice.
        </div>
      </div>
    </>
  )
}
