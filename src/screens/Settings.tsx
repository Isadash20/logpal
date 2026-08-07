import { useEffect, useState } from 'react'
import type { Sex } from '../types'
import { useApp } from '../state/store'
import { Icon } from '../components/Icon'
import { Banner, Row, SaveBar, SelectField, Toggle, TopBar } from '../components/ui'
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
import { cloudEnabled } from '../lib/supabase'
import { fetchUsername, setUsername as setUsernameRemote } from '../services/cloud'

/* ------------------------------------------------------------------ hub -- */

/**
 * Settings tab. Everything is a banner that opens its own page — a phone
 * screen holds one decision comfortably and about forty badly.
 */
export function More() {
  const { push, profile, settings, data, plan, session, syncing, syncError } = useApp()

  return (
    <>
      <TopBar />
      <div className="scroll">
        <div className="pagetitle">Settings</div>

        {/* The summary card is the way in to the profile. It used to be inert,
            with "Account" and "Profile" banners below repeating the same idea in
            two more places — three entry points for one screen. */}
        <button
          onClick={() => push({ name: 'prefsProfile' })}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            width: 'calc(100% - 28px)',
            textAlign: 'left',
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
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{profile.name || 'Your profile'}</div>
            <div style={{ color: 'var(--text-2)', fontSize: 13.5 }}>
              {syncError
                ? 'Sync problem — tap for details'
                : session
                  ? syncing
                    ? 'Syncing…'
                    : (session.user.email ?? 'Signed in')
                  : cloudEnabled()
                    ? 'Not signed in — this device only'
                    : `${cal(plan.calories)} cal/day · ${data.foodEntries.length} entries logged`}
            </div>
          </div>
          <span style={{ color: 'var(--text-3)', flex: 'none', display: 'flex' }}>
            <Icon name="forward" size={18} strokeWidth={2.2} />
          </span>
        </button>

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
          icon="ruler"
          title="Units"
          sub={`${settings.weightUnit} · ${settings.heightUnit} · ${waterUnitLabel(settings.waterUnit)}`}
          onClick={() => push({ name: 'prefsUnits' })}
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
          sub="Version and data sources"
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

  /* Held as a draft and only committed by the save bar. Every field here used
     to write on each keystroke, so a mistyped digit in "minutes per workout"
     was already saved — and, now that data syncs, already pushed to the
     account — before you could correct it. Backing out discards. */
  const [waterText, setWaterText] = useState(() =>
    profile.waterGoalOverrideMl === undefined
      ? ''
      : String(Math.round(mlToDisplay(profile.waterGoalOverrideMl, unit) * 10) / 10),
  )
  const [addsExercise, setAddsExercise] = useState(settings.exerciseAddsCalories)
  const [workouts, setWorkouts] = useState(String(profile.workoutsPerWeek))
  const [minutes, setMinutes] = useState(String(profile.minutesPerWorkout))

  const dirty =
    addsExercise !== settings.exerciseAddsCalories ||
    workouts !== String(profile.workoutsPerWeek) ||
    minutes !== String(profile.minutesPerWorkout) ||
    waterText !==
      (profile.waterGoalOverrideMl === undefined
        ? ''
        : String(Math.round(mlToDisplay(profile.waterGoalOverrideMl, unit) * 10) / 10))

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
                value={waterText}
                onChange={(e) => setWaterText(e.target.value)}
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
            checked={addsExercise}
            onChange={setAddsExercise}
          />
          <label className="field">
            <span className="field__label">Workouts per week</span>
            <span className="field__control">
              <input
                className="input"
                type="number"
                inputMode="numeric"
                value={workouts}
                onChange={(e) => setWorkouts(e.target.value)}
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
                value={minutes}
                onChange={(e) => setMinutes(e.target.value)}
              />
            </span>
          </label>
        </div>
      </div>

      <SaveBar
        disabled={!dirty}
        onSave={() => {
          saveSettings({ exerciseAddsCalories: addsExercise })
          saveProfile({
            workoutsPerWeek: parseInt(workouts) || 0,
            minutesPerWorkout: parseInt(minutes) || 0,
            waterGoalOverrideMl: waterText
              ? displayToMl(parseFloat(waterText) || 0, unit)
              : undefined,
          })
          pop()
        }}
      />
    </>
  )
}

/* -------------------------------------------------------------- profile -- */

/**
 * Profile — identity, account and physical details on one screen.
 *
 * Account used to be its own banner beside Profile, and the Settings hub showed
 * a third profile summary above both. Three places for one idea; this is all of
 * it in the place the summary card already pointed at.
 */
export function PrefsProfile() {
  const { pop, profile, settings, saveProfile, session, syncing, syncError, signOut } =
    useApp()
  const [name, setName] = useState(profile.name)
  const [sex, setSex] = useState<Sex>(profile.sex)
  const [birthDate, setBirthDate] = useState(profile.birthDate)
  const [heightIn, setHeightIn] = useState(profile.heightIn)
  const { feet, inches } = splitFeetInches(heightIn)

  /* The handle lives server-side, in its own world-readable table, so it is
     loaded separately from the rest of the profile and saved separately too —
     it can fail on its own (taken) without losing the other edits. */
  const [username, setUsername] = useState('')
  const [savedUsername, setSavedUsername] = useState<string | null>(null)
  const [handleError, setHandleError] = useState<string | null>(null)
  const [handleBusy, setHandleBusy] = useState(false)

  useEffect(() => {
    if (!session) return
    let live = true
    void fetchUsername()
      .then((u) => {
        if (!live) return
        setSavedUsername(u)
        setUsername(u ?? '')
      })
      .catch(() => {
        /* Not worth surfacing; the field simply starts empty. */
      })
    return () => {
      live = false
    }
  }, [session])

  async function saveHandle() {
    setHandleBusy(true)
    setHandleError(null)
    try {
      await setUsernameRemote(username)
      setSavedUsername(username.trim().toLowerCase())
    } catch (err) {
      setHandleError((err as Error).message)
    } finally {
      setHandleBusy(false)
    }
  }

  return (
    <>
      <TopBar title="Profile" onBack={pop} solid />
      <div className="scroll">
        {session && (
          <>
            <div className="section-label">Account</div>
            <div className="card">
              <Row title="Signed in as" value={session.user.email ?? '—'} />
              <Row
                title="Sync"
                value={syncError ? 'Problem' : syncing ? 'Syncing…' : 'Up to date'}
              />
              <label className="field">
                <span className="field__label">Username</span>
                <span className="field__control">
                  <input
                    className="input"
                    autoCapitalize="none"
                    spellCheck={false}
                    placeholder="yourname"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                  />
                </span>
              </label>
            </div>

            {handleError && (
              <div className="hint" style={{ color: 'var(--danger)' }}>
                {handleError}
              </div>
            )}
            {username.trim().toLowerCase() !== (savedUsername ?? '') && (
              <div className="btn-wrap">
                <button
                  className="btn btn--ghost"
                  disabled={handleBusy || username.trim().length < 3}
                  onClick={() => void saveHandle()}
                >
                  {handleBusy ? 'Checking…' : 'Save username'}
                </button>
              </div>
            )}
            <div className="hint">
              Your username is how friends will find you, and you can sign in with
              it instead of your email. Your display name below is what shows up in
              the app.
            </div>

            <div className="btn-wrap">
              <button className="btn btn--ghost" onClick={() => void signOut()}>
                Sign out
              </button>
            </div>
            <div className="hint" style={{ color: 'var(--text-3)' }}>
              Signing out leaves this device&apos;s copy in place. It does not delete
              anything from your account.
            </div>
          </>
        )}

        {cloudEnabled() && !session && (
          <>
            <div className="section-label">Account</div>
            <div className="card">
              <Row title="Status" value="This device only" />
            </div>
            <div className="hint">
              You are using LogPal without an account, so the diary lives only in
              this browser and your phone and laptop do not share.
            </div>
            <SignInPrompt />
          </>
        )}

        <div className="section-label">About you</div>
        <div className="card">
          <label className="field">
            <span className="field__label">Display name</span>
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



/* ----------------------------------------------------------- appearance -- */

export function PrefsAppearance() {
  const { pop, settings, saveSettings } = useApp()
  const [theme, setTheme] = useState(settings.theme)

  return (
    <>
      <TopBar title="Appearance" onBack={pop} solid />
      <div className="scroll">
        <div className="card" style={{ marginTop: 12 }}>
          <SelectField
            label="Theme"
            value={theme}
            onChange={setTheme}
            options={[
              { value: 'system', label: 'Match system' },
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
            ]}
          />
        </div>
        <div className="hint">
          The theme changes when you save, so backing out leaves it as it was.
        </div>
      </div>

      <SaveBar
        disabled={theme === settings.theme}
        onSave={() => {
          saveSettings({ theme })
          pop()
        }}
      />
    </>
  )
}

/* ---------------------------------------------------------------- about -- */

export function About() {
  const { pop, session } = useApp()

  /* No "reset all data" button here any more, by request. It was a one-tap
     path to irreversibly deleting a diary, sitting on an otherwise harmless
     information screen — and now that data syncs, it would wipe the account
     rather than just this browser. Signing out is on the Account screen;
     deleting an account is a deliberate enough act to belong elsewhere. */
  return (
    <>
      <TopBar title="About" onBack={pop} solid />
      <div className="scroll">
        <div className="card" style={{ marginTop: 12 }}>
          <Row title="Version" value={`0.1.0 · ${__BUILD_SHA__}`} />
          <Row title="Food data" value="USDA + Open Food Facts" />
          <Row title="Calorie equation" value="Mifflin-St Jeor" />
        </div>

        <div className="hint">
          Whole-food nutrition comes from USDA FoodData Central; packaged products come
          from Open Food Facts, a community database. Calorie and hydration targets are
          estimates from standard equations — none of it is medical advice.
        </div>

        <div className="hint">
          {session
            ? 'Your diary syncs to your account, so it follows you between devices.'
            : 'You are signed out, so everything lives in this browser only. Clearing site data starts you over.'}
        </div>
      </div>
    </>
  )
}

/** Drops back to the auth screen so someone local-only can sign in. */
function SignInPrompt() {
  const { setLocalOnly } = useApp()
  return (
    <div className="btn-wrap">
      <button className="btn" onClick={() => setLocalOnly(false)}>
        Sign in to sync
      </button>
    </div>
  )
}
