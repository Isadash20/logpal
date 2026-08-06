import { useEffect, useState } from 'react'
import type { Sex } from '../types'
import { useApp } from '../state/store'
import { Banner, Dialog, Row, SaveBar, SelectField, Toggle, TopBar } from '../components/ui'
import { SEED_FOODS } from '../data/seedFoods'
import {
  displayToIn,
  displayToMl,
  inToDisplay,
  mlToDisplay,
  splitFeetInches,
  waterUnitLabel,
} from '../lib/units'
import { cal } from '../lib/format'
import { PROTOCOL_BY_KEY } from '../lib/fasting'
import {
  extendedDbLoaded,
  foodDbSize,
  loadExtendedFoodDb,
  loadFoodDb,
  onFoodDbGrown,
} from '../services/foodDb'

/* ------------------------------------------------------------------ hub -- */

/**
 * Settings tab. Everything is a banner that opens its own page — a phone
 * screen holds one decision comfortably and about forty badly.
 */
export function More() {
  const { push, profile, settings, data, plan } = useApp()

  return (
    <>
      <TopBar />
      <div className="scroll">
        <div className="pagetitle">Settings</div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            margin: '0 14px 16px',
            padding: '16px 14px',
            background: 'var(--surface)',
            borderRadius: 16,
            boxShadow: 'var(--shadow-1)',
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
              fontSize: 21,
              flex: 'none',
            }}
          >
            {(profile.name || 'You').slice(0, 1).toUpperCase()}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{profile.name || 'Your profile'}</div>
            <div style={{ color: 'var(--text-2)', fontSize: 13.5 }}>
              {cal(plan.calories)} cal/day · {data.foodEntries.length} entries logged
            </div>
          </div>
        </div>

        <Banner
          icon="bookmark"
          title="Foods"
          sub="Meals, recipes and your own foods"
          onClick={() => push({ name: 'foodsHub' })}
        />
        <Banner
          icon="chart"
          title="Plan"
          sub="Goals, targets, exercise and water"
          onClick={() => push({ name: 'planHub' })}
        />
        <Banner
          icon="clock"
          title="Intermittent fasting"
          sub={
            data.fasts.length
              ? `${PROTOCOL_BY_KEY[data.fasting.protocol].label} · ${data.fasts.length} logged`
              : 'Not started yet'
          }
          onClick={() => push({ name: 'fasting' })}
        />
        <Banner
          icon="user"
          title="Profile"
          sub="Name, sex, date of birth, height"
          onClick={() => push({ name: 'prefsProfile' })}
        />
        <Banner
          icon="ruler"
          title="Units"
          sub={`${settings.weightUnit} · ${settings.heightUnit} · ${waterUnitLabel(settings.waterUnit)}`}
          onClick={() => push({ name: 'prefsUnits' })}
        />
        <Banner
          icon="search"
          title="Food database"
          sub={settings.useOpenFoodFacts ? 'Online search on' : 'Built-in foods only'}
          onClick={() => push({ name: 'prefsFoodDb' })}
        />
        <Banner
          icon="star"
          title="Appearance"
          sub={settings.theme === 'system' ? 'Match system' : settings.theme}
          onClick={() => push({ name: 'prefsAppearance' })}
        />
        <Banner
          icon="info"
          title="About"
          sub="Version, data sources, reset"
          onClick={() => push({ name: 'about' })}
        />
      </div>
    </>
  )
}

/* ------------------------------------------------------------ foods hub -- */

export function FoodsHub() {
  const { pop, push, data } = useApp()
  return (
    <>
      <TopBar title="Foods" onBack={pop} solid />
      <div className="scroll">
        <div style={{ height: 12 }} />
        <Banner
          icon="bookmark"
          title="My meals"
          sub="Foods you log together"
          value={data.savedMeals.length}
          onClick={() => push({ name: 'meals' })}
        />
        <Banner
          icon="note"
          title="My recipes"
          sub="Built from ingredients, logged per serving"
          value={data.recipes.length}
          onClick={() => push({ name: 'recipes' })}
        />
        <Banner
          icon="edit"
          title="My foods"
          sub="Foods you entered yourself"
          value={data.customFoods.length}
          onClick={() => push({ name: 'myFoods' })}
        />
      </div>
    </>
  )
}

/* ------------------------------------------------------------- plan hub -- */

/**
 * Everything that shapes the daily numbers, including the diary and exercise
 * preferences that used to sit in their own section.
 */
export function PlanHub() {
  const { pop, push, settings, profile, saveSettings, saveProfile, plan } = useApp()
  const unit = settings.waterUnit
  const shownWater = Math.round(mlToDisplay(plan.waterMl, unit) * 10) / 10
  const override = profile.waterGoalOverrideMl

  return (
    <>
      <TopBar title="Plan" onBack={pop} solid />
      <div className="scroll">
        <div style={{ height: 12 }} />
        <Banner
          icon="chart"
          title="Goals"
          sub="What you're working toward and how fast"
          onClick={() => push({ name: 'goals' })}
        />

        <div className="section-label">Daily targets</div>
        <div className="card">
          <Row title="Calories" value={cal(plan.calories)} />
          <Row title="Carbohydrates" value={`${plan.macros.carbs} g`} />
          <Row title="Fat" value={`${plan.macros.fat} g`} />
          <Row title="Protein" value={`${plan.macros.protein} g`} />
          <Row title="Water" value={`${shownWater} ${waterUnitLabel(unit)}`} />
        </div>

        <div className="section-label">Water</div>
        <div className="card">
          {/* Entered and shown in the unit chosen under Units, never raw ml. */}
          <label className="field">
            <span className="field__label">Override goal</span>
            <span className="field__control">
              <input
                className="input"
                type="number"
                inputMode="decimal"
                placeholder={String(shownWater)}
                value={
                  override === undefined ? '' : Math.round(mlToDisplay(override, unit) * 10) / 10
                }
                onChange={(e) =>
                  saveProfile({
                    waterGoalOverrideMl: e.target.value
                      ? displayToMl(parseFloat(e.target.value) || 0, unit)
                      : undefined,
                  })
                }
              />
              <span className="unit">{waterUnitLabel(unit)}</span>
            </span>
          </label>
        </div>
        <div className="hint">
          Leave it blank to use the calculated target, which scales with your weight,
          height, age, activity level and the exercise you log.
        </div>

        <div className="section-label">Exercise</div>
        <div className="card">
          <Toggle
            label="Add exercise calories to your goal"
            sub="When on, calories you burn increase what you can eat that day."
            checked={settings.exerciseAddsCalories}
            onChange={(v) => saveSettings({ exerciseAddsCalories: v })}
          />
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
      </div>
    </>
  )
}

/* -------------------------------------------------------------- profile -- */

export function PrefsProfile() {
  const { pop, profile, settings, saveProfile } = useApp()
  const [name, setName] = useState(profile.name)
  const [sex, setSex] = useState<Sex>(profile.sex)
  const [birthDate, setBirthDate] = useState(profile.birthDate)
  const [heightIn, setHeightIn] = useState(profile.heightIn)
  const { feet, inches } = splitFeetInches(heightIn)

  return (
    <>
      <TopBar title="Profile" onBack={pop} solid />
      <div className="scroll">
        <div className="card" style={{ marginTop: 12 }}>
          <label className="field">
            <span className="field__label">Name</span>
            <span className="field__control">
              <input
                className="input"
                value={name}
                placeholder="Optional"
                onChange={(e) => setName(e.target.value)}
              />
            </span>
          </label>
          <SelectField
            label="Sex"
            value={sex}
            onChange={(v) => setSex(v as Sex)}
            options={[
              { value: 'female', label: 'Female' },
              { value: 'male', label: 'Male' },
            ]}
          />
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
                  onChange={(e) => setHeightIn((parseInt(e.target.value) || 0) * 12 + inches)}
                />
                <span className="unit">ft</span>
                <input
                  className="input"
                  type="number"
                  inputMode="numeric"
                  style={{ width: 44 }}
                  value={inches}
                  onChange={(e) => setHeightIn(feet * 12 + (parseInt(e.target.value) || 0))}
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
                  value={Math.round(inToDisplay(heightIn, 'cm'))}
                  onChange={(e) => setHeightIn(displayToIn(parseFloat(e.target.value) || 0, 'cm'))}
                />
                <span className="unit">cm</span>
              </span>
            </label>
          )}
        </div>
        <div className="hint">
          Sex, age and height all feed the calorie equation, so changing any of them
          reshapes your daily targets.
        </div>
      </div>
      <SaveBar
        onSave={() => {
          saveProfile({ name, sex, birthDate, heightIn })
          pop()
        }}
      />
    </>
  )
}

/* ---------------------------------------------------------------- units -- */

export function PrefsUnits() {
  const { pop, settings, saveSettings } = useApp()
  const [weightUnit, setWeightUnit] = useState(settings.weightUnit)
  const [heightUnit, setHeightUnit] = useState(settings.heightUnit)
  const [waterUnit, setWaterUnit] = useState(settings.waterUnit)

  return (
    <>
      <TopBar title="Units" onBack={pop} solid />
      <div className="scroll">
        <div className="card" style={{ marginTop: 12 }}>
          <SelectField
            label="Weight"
            value={weightUnit}
            onChange={setWeightUnit}
            options={[
              { value: 'lb', label: 'Pounds (lb)' },
              { value: 'kg', label: 'Kilograms (kg)' },
            ]}
          />
          <SelectField
            label="Height"
            value={heightUnit}
            onChange={setHeightUnit}
            options={[
              { value: 'in', label: 'Feet and inches' },
              { value: 'cm', label: 'Centimetres' },
            ]}
          />
          <SelectField
            label="Water"
            value={waterUnit}
            onChange={setWaterUnit}
            options={[
              { value: 'cup', label: 'Cups' },
              { value: 'floz', label: 'Fluid ounces' },
              { value: 'ml', label: 'Millilitres' },
            ]}
          />
        </div>
        <div className="hint">
          Your water target is shown in whichever unit you pick here, everywhere in the
          app.
        </div>
      </div>
      <SaveBar
        onSave={() => {
          saveSettings({ weightUnit, heightUnit, waterUnit })
          pop()
        }}
      />
    </>
  )
}

/* -------------------------------------------------------- food database -- */

export function PrefsFoodDb() {
  const { pop, settings, saveSettings, data } = useApp()

  /* The offline database loads in two stages and its size changes underneath
     this screen, so it is mirrored into state rather than read once at render. */
  const [size, setSize] = useState(foodDbSize())
  const [full, setFull] = useState(extendedDbLoaded())
  useEffect(() => {
    void loadFoodDb()
    const sync = () => {
      setSize(foodDbSize())
      setFull(extendedDbLoaded())
    }
    sync()
    return onFoodDbGrown(sync)
  }, [])

  return (
    <>
      <TopBar title="Food database" onBack={pop} solid />
      <div className="scroll">
        <div className="card" style={{ marginTop: 12 }}>
          <Toggle
            label="Search Open Food Facts"
            sub="Adds live product search and barcode lookup. Needs a connection."
            checked={settings.useOpenFoodFacts}
            onChange={(v) => saveSettings({ useOpenFoodFacts: v })}
          />
        </div>
        <div className="card">
          <Row title="Curated foods" value={SEED_FOODS.length} />
          <Row title="Offline database" value={size ? size.toLocaleString() : '—'} />
          <Row title="Your custom foods" value={data.customFoods.length} />
          <Row title="Scanned and saved" value={Object.keys(data.foodCache).length} />
        </div>

        {/* Never fetched automatically: it is a large download and a large
            amount of memory once loaded, which is a fair thing to offer and an
            unfair thing to impose on a phone. */}
        {!full && (
          <div className="btn-wrap">
            <button className="btn btn--ghost" onClick={() => void loadExtendedFoodDb()}>
              Add the extended database
            </button>
          </div>
        )}

        <div className="hint">
          {full
            ? 'The extended database is loaded for this session. Search covers the full long tail of packaged products.'
            : 'Every generic food and the most common packaged products are already on this device. The extended set adds 175,000 more niche products — a larger download, and heavier on memory.'}
        </div>
        <div className="hint">
          Anything you scan is checked for real nutrition data, then saved to this device
          so it turns up in search from then on — even offline.
        </div>
      </div>
    </>
  )
}

/* ----------------------------------------------------------- appearance -- */

export function PrefsAppearance() {
  const { pop, settings, saveSettings } = useApp()
  return (
    <>
      <TopBar title="Appearance" onBack={pop} solid />
      <div className="scroll">
        <div className="card" style={{ marginTop: 12 }}>
          <SelectField
            label="Theme"
            value={settings.theme}
            onChange={(v) => saveSettings({ theme: v })}
            options={[
              { value: 'system', label: 'Match system' },
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
            ]}
          />
        </div>
      </div>
    </>
  )
}

/* ---------------------------------------------------------------- about -- */

export function About() {
  const { pop, resetAll } = useApp()
  const [confirmReset, setConfirmReset] = useState(false)

  return (
    <>
      <TopBar title="About" onBack={pop} solid />
      <div className="scroll">
        <div className="card" style={{ marginTop: 12 }}>
          <Row title="Version" value="0.1.0" />
          <Row title="Food data" value="USDA + Open Food Facts" />
          <Row title="Calorie equation" value="Mifflin-St Jeor" />
        </div>

        <div className="hint">
          Whole-food nutrition comes from USDA FoodData Central; packaged products come
          from Open Food Facts, a community database. Calorie and hydration targets are
          estimates from standard equations — none of it is medical advice.
        </div>

        <div className="btn-wrap">
          <button className="btn btn--danger" onClick={() => setConfirmReset(true)}>
            Reset all data
          </button>
        </div>
        <div className="hint">
          Everything lives in this browser. Clearing site data or switching devices
          starts you over.
        </div>
      </div>

      {confirmReset && (
        <Dialog title="Reset everything?" onClose={() => setConfirmReset(false)}>
          <div style={{ color: 'var(--text-2)', marginBottom: 16, fontSize: 14 }}>
            This permanently deletes your diary, weight history, custom foods, recipes,
            fasts and goals from this browser. It can&apos;t be undone.
          </div>
          <button
            className="btn btn--danger"
            onClick={() => {
              resetAll()
              setConfirmReset(false)
            }}
          >
            Delete everything
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
