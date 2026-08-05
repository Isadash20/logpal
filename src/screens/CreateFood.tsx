import { useState } from 'react'
import type { Food, NutrientKey, Nutrients } from '../types'
import { useApp } from '../state/store'
import { TopBar } from '../components/ui'
import { NUTRIENTS, SHORT_LABELS } from '../data/nutrients'
import { caloriesFromMacros, emptyNutrients, scaleNutrients } from '../lib/nutrition'
import { uid } from '../lib/id'
import { cal } from '../lib/format'

/**
 * Two-step create-food wizard: identity and serving first, then the nutrition
 * panel. Splitting it keeps the long nutrient list from burying the fields that
 * actually matter for finding the food again later.
 */
export function CreateFood({
  barcode,
  returnTo,
}: {
  barcode?: string
  returnTo?: { date: string }
}) {
  const { pop, push, saveCustomFood } = useApp()
  const [step, setStep] = useState<1 | 2>(1)

  const [brand, setBrand] = useState('')
  const [name, setName] = useState('')
  const [servingLabel, setServingLabel] = useState('1 serving')
  const [servingGrams, setServingGrams] = useState('')
  const [values, setValues] = useState<Record<string, string>>({})

  const set = (k: NutrientKey, v: string) => setValues((p) => ({ ...p, [k]: v }))
  const num = (k: NutrientKey) => parseFloat(values[k] ?? '') || 0

  const macroCals = caloriesFromMacros({
    carbs: num('carbs'),
    fat: num('fat'),
    protein: num('protein'),
  })
  const statedCals = num('calories')
  // Flag a mismatch the way a label sanity-check would — off by more than 10%.
  const mismatch =
    statedCals > 0 && macroCals > 0 && Math.abs(macroCals - statedCals) / statedCals > 0.1

  function save() {
    const n: Nutrients = { ...emptyNutrients() }
    for (const def of NUTRIENTS) n[def.key] = num(def.key)

    const grams = parseFloat(servingGrams) || 0
    const food: Food = {
      id: uid('cf'),
      name: name.trim() || 'Custom Food',
      brand: brand.trim() || undefined,
      nutrients: n,
      servings: [
        { label: servingLabel.trim() || '1 serving', grams: grams || undefined, multiplier: 1 },
        ...(grams > 0
          ? [
              { label: '100 g', grams: 100, multiplier: 100 / grams },
              { label: '1 g', grams: 1, multiplier: 1 / grams },
            ]
          : []),
      ],
      source: 'custom',
      barcode,
    }

    saveCustomFood(food)
    pop()
    if (returnTo) {
      push({
        name: 'foodDetail',
        food,
        date: returnTo.date,
      })
    }
  }

  const canContinue = name.trim().length > 0

  return (
    <>
      <TopBar
        title={step === 1 ? 'Create Food' : 'Nutrition Facts'}
        onBack={step === 1 ? pop : () => setStep(1)}
        right={
          step === 1 ? (
            <button className="textbtn" disabled={!canContinue} onClick={() => setStep(2)}>
              Next
            </button>
          ) : (
            <button className="textbtn" onClick={save}>
              Save
            </button>
          )
        }
      />

      <div className="scroll">
        {step === 1 ? (
          <>
            {barcode && (
              <div className="hint">
                Barcode <strong>{barcode}</strong> wasn&apos;t found online. Fill in the
                label and it will be saved to your foods.
              </div>
            )}
            <div className="card" style={{ marginTop: 0 }}>
              <label className="field">
                <span className="field__label">Brand</span>
                <span className="field__control">
                  <input
                    className="input"
                    placeholder="Optional"
                    value={brand}
                    onChange={(e) => setBrand(e.target.value)}
                  />
                </span>
              </label>
              <label className="field">
                <span className="field__label">Description</span>
                <span className="field__control">
                  <input
                    className="input"
                    placeholder="e.g. Greek Yogurt"
                    autoFocus
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </span>
              </label>
            </div>

            <div className="section-label">Serving</div>
            <div className="card">
              <label className="field">
                <span className="field__label">Serving Size</span>
                <span className="field__control">
                  <input
                    className="input"
                    placeholder="1 cup"
                    value={servingLabel}
                    onChange={(e) => setServingLabel(e.target.value)}
                  />
                </span>
              </label>
              <label className="field">
                <span className="field__label">Weight</span>
                <span className="field__control">
                  <input
                    className="input"
                    type="number"
                    inputMode="decimal"
                    placeholder="Optional"
                    value={servingGrams}
                    onChange={(e) => setServingGrams(e.target.value)}
                  />
                  <span className="unit">g</span>
                </span>
              </label>
            </div>
            <div className="hint">
              Adding a gram weight lets you log this food by weight as well as by serving.
            </div>

            <div className="btn-wrap">
              <button className="btn" disabled={!canContinue} onClick={() => setStep(2)}>
                Next
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="hint" style={{ paddingTop: 14 }}>
              Enter the values for <strong>{servingLabel || '1 serving'}</strong>. Leave
              anything the label doesn&apos;t list blank.
            </div>

            <div className="card">
              {NUTRIENTS.map((def) => (
                <label className="field" key={def.key}>
                  <span
                    className="field__label"
                    style={{
                      paddingLeft: def.indent ? 14 : 0,
                      color: def.indent ? 'var(--text-2)' : undefined,
                    }}
                  >
                    {SHORT_LABELS[def.key] ?? def.label}
                  </span>
                  <span className="field__control">
                    <input
                      className="input"
                      type="number"
                      inputMode="decimal"
                      placeholder="0"
                      value={values[def.key] ?? ''}
                      onChange={(e) => set(def.key, e.target.value)}
                    />
                    <span className="unit">{def.unit === 'cal' ? 'cal' : def.unit}</span>
                  </span>
                </label>
              ))}
            </div>

            {mismatch && (
              <div
                className="hint"
                style={{ color: 'var(--warning)', fontWeight: 600 }}
              >
                Heads up: the macros add up to {cal(macroCals)} calories but you entered{' '}
                {cal(statedCals)}. Labels round, so a small gap is normal — a large one
                usually means a typo.
              </div>
            )}

            <div className="btn-wrap">
              <button className="btn" onClick={save}>
                Save Food
              </button>
            </div>
          </>
        )}
      </div>
    </>
  )
}

export { scaleNutrients }
