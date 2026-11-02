import { useEffect, useMemo, useState } from 'react'
import type { Sex } from '../types'
import { useApp } from '../state/store'
import { Icon } from '../components/Icon'
import { Banner, Dialog, Row, SaveBar, SelectField, Toggle, TopBar } from '../components/ui'
import {
  displayToIn,
  displayToMl,
  inToDisplay,
  mlToDisplay,
  splitFeetInches,
  waterUnitLabel,
} from '../lib/units'
import { cal, timeOfDay } from '../lib/format'
import { PROTOCOL_BY_KEY } from '../lib/fasting'
import { displayNameFrom } from '../lib/storage'
import { fileToAvatar } from '../lib/avatar'
import { cloudEnabled } from '../lib/supabase'
import { fetchUsername, setUsername as setUsernameRemote } from '../services/cloud'
import { pendingRequestCount } from '../services/social'
import {
  LOCALES,
  deviceLocale,
  deviceTimeZone,
  formatOffset,
  offsetMinutes,
  resolveTimeZone,
  timeZoneOptions,
  useT,
} from '../i18n'

/* ------------------------------------------------------------------ hub -- */

/**
 * Settings tab. Everything is a banner that opens its own page. A phone
 * screen holds one decision comfortably and about forty badly.
 */
export function More() {
  const { push, profile, settings, data, plan, session, syncing, syncError, healthSupported } =
    useApp()
  const t = useT()
  const languageName =
    LOCALES.find((l) => l.code === (settings.language === 'auto' ? deviceLocale() : settings.language))?.name ??
    'English'
  const zoneName = resolveTimeZone(settings.timeZone).replace(/_/g, ' ').split('/').pop() ?? ''

  return (
    <>
      <TopBar />
      <div className="scroll">
        <div className="pagetitle">{t('tabs.settings')}</div>

        {/* The summary card is the way in to the profile. It used to be inert,
            with "Account" and "Profile" banners below repeating the same idea in
            two more places. Three entry points for one screen. */}
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
            className="avatar"
            style={{ width: 52, height: 52, fontSize: 21, overflow: 'hidden' }}
          >
            {profile.avatar ? (
              <img src={profile.avatar} alt="" />
            ) : (
              (profile.name || t('settings.you')).slice(0, 1).toUpperCase()
            )}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{profile.name || t('settings.yourProfile')}</div>
            <div
              style={{
                color: 'var(--text-2)',
                fontSize: 13.5,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {profile.bio ||
                (syncError
                ? t('settings.syncProblem')
                : session
                  ? syncing
                    ? t('settings.syncing')
                    : (session.user.email ?? t('settings.signedIn'))
                  : cloudEnabled()
                    ? t('settings.notSignedIn')
                    : t('settings.summary', { cal: cal(plan.calories), n: data.foodEntries.length }))}
            </div>
          </div>
          <span style={{ color: 'var(--text-3)', flex: 'none', display: 'flex' }}>
            <Icon name="forward" size={18} strokeWidth={2.2} />
          </span>
        </button>

        {/* Only with credentials to sign in against, following needs two
            accounts, so on a device-local build the banner would open a screen
            whose only content is an explanation of why it is empty. */}
        {cloudEnabled() && <FriendsBanner />}

        <Banner
          icon="bookmark"
          title={t('settings.foods')}
          sub={t('settings.foodsSub')}
          onClick={() => push({ name: 'foodsHub' })}
        />
        <Banner
          icon="chart"
          title={t('settings.plan')}
          sub={t('settings.planSub')}
          onClick={() => push({ name: 'planHub' })}
        />
        <Banner
          icon="clock"
          title={t('settings.fasting')}
          sub={
            data.fasts.length
              ? t('settings.fastingSub', {
                  protocol: PROTOCOL_BY_KEY[data.fasting.protocol].label,
                  n: data.fasts.length,
                })
              : t('settings.notStarted')
          }
          onClick={() => push({ name: 'fasting' })}
        />
        <Banner
          icon="ruler"
          title={t('settings.units')}
          sub={`${settings.weightUnit} · ${settings.heightUnit} · ${waterUnitLabel(settings.waterUnit)}`}
          onClick={() => push({ name: 'prefsUnits' })}
        />
        <Banner
          icon="globe"
          title={t('settings.region')}
          sub={t('settings.regionSub', { language: languageName, zone: zoneName })}
          onClick={() => push({ name: 'prefsRegion' })}
        />
        {/* Only the iOS app has a Health store to talk to. */}
        {healthSupported && (
          <Banner
            icon="apple"
            title={t('settings.health')}
            sub={settings.healthSync ? t('settings.healthOn') : t('settings.healthSub')}
            onClick={() => push({ name: 'prefsHealth' })}
          />
        )}
        <Banner
          icon="star"
          title={t('settings.appearance')}
          sub={
            settings.theme === 'system'
              ? t('settings.matchSystem')
              : settings.theme === 'dark'
                ? t('settings.dark')
                : t('settings.light')
          }
          onClick={() => push({ name: 'prefsAppearance' })}
        />
        <Banner
          icon="info"
          title={t('settings.about')}
          sub={t('settings.aboutSub')}
          onClick={() => push({ name: 'about' })}
        />
      </div>
    </>
  )
}

/**
 * Friends, with a count of anyone waiting on approval.
 *
 * The count is the only reason this is a component rather than a `Banner` in
 * the list above: a request made on a private account has nowhere else to
 * surface, so it would sit unanswered until its recipient happened to open the
 * screen. A failed count is silently no badge. A settings list is not the
 * place to report a network problem.
 */
function FriendsBanner() {
  const { push, session } = useApp()
  const t = useT()
  const [pending, setPending] = useState(0)

  useEffect(() => {
    if (!session) return
    let live = true
    void pendingRequestCount(session.user.id)
      .then((n) => live && setPending(n))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [session])

  return (
    <Banner
      icon="user"
      title={t('tabs.friends')}
      sub={session ? t('settings.friendsSub') : t('settings.friendsSignIn')}
      value={pending ? <span className="badge">{t('settings.waiting', { n: pending })}</span> : undefined}
      onClick={() => push({ name: 'friends' })}
    />
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
     was already saved, and, now that data syncs, already pushed to the
     account, before you could correct it. Backing out discards. */
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
          <Row title="Calories" value={cal(plan.calories)} chevron onClick={() => push({ name: 'goals' })} />
          <Row title="Carbohydrates" value={`${plan.macros.carbs} g`} chevron onClick={() => push({ name: 'goals' })} />
          <Row title="Fat" value={`${plan.macros.fat} g`} chevron onClick={() => push({ name: 'goals' })} />
          <Row title="Protein" value={`${plan.macros.protein} g`} chevron onClick={() => push({ name: 'goals' })} />
          <Row title="Water" value={`${shownWater} ${waterUnitLabel(unit)}`} chevron onClick={() => push({ name: 'goals' })} />
        </div>
        <div className="hint">
          Tap any target to edit it, or to switch between the recommended plan and your own.
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
 * Profile, identity, account and physical details on one screen.
 *
 * Account used to be its own banner beside Profile, and the Settings hub showed
 * a third profile summary above both. Three places for one idea; this is all of
 * it in the place the summary card already pointed at.
 */
export function PrefsProfile() {
  const { pop, profile, settings, saveProfile, session, syncing, syncError, signOut } =
    useApp()
  /* First and last, not the derived display name, editing the derived value
     directly would leave the parts it came from disagreeing with it. */
  const [firstName, setFirstName] = useState(profile.firstName ?? profile.name)
  const [lastName, setLastName] = useState(profile.lastName ?? '')
  const [avatar, setAvatar] = useState<string | undefined>(profile.avatar)
  const [bio, setBio] = useState(profile.bio ?? '')
  const [photoError, setPhotoError] = useState<string | null>(null)
  const [sex, setSex] = useState<Sex>(profile.sex)
  const [birthDate, setBirthDate] = useState(profile.birthDate)
  const [heightIn, setHeightIn] = useState(profile.heightIn)
  const { feet, inches } = splitFeetInches(heightIn)

  /* The handle lives server-side, in its own world-readable table, so it is
     loaded separately from the rest of the profile and saved separately too,
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
              <Row title="Signed in as" value={session.user.email ?? '-'} />
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

            <DeleteAccount />
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
          <div className="avatarpick">
            <div className="avatar avatar--lg" style={{ overflow: 'hidden' }}>
              {avatar ? (
                <img src={avatar} alt="" />
              ) : (
                (firstName || profile.name || 'You').slice(0, 1).toUpperCase()
              )}
            </div>
            <div className="avatarpick__actions">
              <label className="btn btn--ghost btn--sm" style={{ cursor: 'pointer' }}>
                {avatar ? 'Change photo' : 'Add a photo'}
                <input
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    e.target.value = ''
                    if (!f) return
                    setPhotoError(null)
                    fileToAvatar(f)
                      .then(setAvatar)
                      .catch(() => setPhotoError('That photo could not be read. Try another.'))
                  }}
                />
              </label>
              {avatar && (
                <button className="textbtn" onClick={() => setAvatar(undefined)}>
                  Remove
                </button>
              )}
            </div>
          </div>
          {photoError && (
            <div className="hint" style={{ color: 'var(--danger)' }}>
              {photoError}
            </div>
          )}
          <label className="field field--stack">
            <span className="field__label">Bio</span>
            <span className="field__control">
              <textarea
                className="input textarea"
                rows={2}
                maxLength={160}
                placeholder="A line about you"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
              />
            </span>
            <span className="field__count">{bio.length}/160</span>
          </label>
          <label className="field">
            <span className="field__label">First name</span>
            <span className="field__control">
              <input
                className="input"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
              />
            </span>
          </label>
          <label className="field">
            <span className="field__label">Last name</span>
            <span className="field__control">
              <input
                className="input"
                value={lastName}
                placeholder="Optional"
                onChange={(e) => setLastName(e.target.value)}
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

        <ClearData />
      </div>
      <SaveBar
        onSave={() => {
          saveProfile({
            firstName: firstName.trim(),
            lastName: lastName.trim() || undefined,
            name: displayNameFrom(firstName, lastName),
            avatar,
            bio: bio.trim() || undefined,
            sex,
            birthDate,
            heightIn,
          })
          pop()
        }}
      />
    </>
  )
}

/* ---------------------------------------------------------------- units -- */

export function PrefsUnits() {
  const { pop, settings, saveSettings } = useApp()
  const t = useT()
  const [weightUnit, setWeightUnit] = useState(settings.weightUnit)
  const [heightUnit, setHeightUnit] = useState(settings.heightUnit)
  const [waterUnit, setWaterUnit] = useState(settings.waterUnit)

  return (
    <>
      <TopBar title={t('settings.units')} onBack={pop} solid />
      <div className="scroll">
        <div className="card" style={{ marginTop: 12 }}>
          <SelectField
            label={t('settings.weight')}
            value={weightUnit}
            onChange={setWeightUnit}
            options={[
              { value: 'lb', label: t('settings.pounds') },
              { value: 'kg', label: t('settings.kilograms') },
            ]}
          />
          <SelectField
            label={t('settings.height')}
            value={heightUnit}
            onChange={setHeightUnit}
            options={[
              { value: 'in', label: t('settings.feetInches') },
              { value: 'cm', label: t('settings.centimetres') },
            ]}
          />
          <SelectField
            label={t('settings.water')}
            value={waterUnit}
            onChange={setWaterUnit}
            options={[
              { value: 'cup', label: t('settings.cups') },
              { value: 'floz', label: t('settings.flOz') },
              { value: 'ml', label: t('settings.millilitres') },
            ]}
          />
        </div>
        <div className="hint">{t('settings.unitsHint')}</div>
      </div>
      <SaveBar
        label={t('common.save')}
        onSave={() => {
          saveSettings({ weightUnit, heightUnit, waterUnit })
          pop()
        }}
      />
    </>
  )
}

/* --------------------------------------------------------------- region -- */

/**
 * Language and time zone.
 *
 * Both default to the device and both can be pinned. The language list is
 * the languages the app has strings for; the zone list is every zone the
 * runtime knows, with its current offset, so a traveller can find "their"
 * zone without knowing its IANA name. A clock under the picker shows the
 * time there right now, which is the quickest way to confirm the choice.
 */
export function PrefsRegion() {
  const { pop, settings, saveSettings } = useApp()
  const t = useT()
  const [language, setLanguage] = useState(settings.language)
  const [timeZone, setTimeZone] = useState(settings.timeZone)
  const zones = useMemo(() => timeZoneOptions(), [])

  const deviceLang = LOCALES.find((l) => l.code === deviceLocale())?.name ?? 'English'
  const deviceZone = deviceTimeZone()
  const effectiveZone = resolveTimeZone(timeZone)
  let localTime = ''
  try {
    localTime = new Intl.DateTimeFormat(undefined, {
      timeZone: effectiveZone,
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date())
  } catch {
    localTime = ''
  }

  return (
    <>
      <TopBar title={t('settings.region')} onBack={pop} solid />
      <div className="scroll">
        <div className="card" style={{ marginTop: 12 }}>
          <SelectField
            label={t('settings.language')}
            value={language}
            onChange={setLanguage}
            options={[
              { value: 'auto' as const, label: t('settings.automatic', { value: deviceLang }) },
              ...LOCALES.map((l) => ({ value: l.code, label: l.name })),
            ]}
          />
          <SelectField
            label={t('settings.timeZone')}
            value={timeZone}
            onChange={setTimeZone}
            options={[
              {
                value: 'auto',
                label: t('settings.automatic', {
                  value: `${deviceZone.replace(/_/g, ' ').split('/').pop()}, ${formatOffset(offsetMinutes(deviceZone))}`,
                }),
              },
              ...zones,
            ]}
          />
        </div>
        {localTime && <div className="hint">{t('settings.localTime', { time: localTime })}</div>}
        <div className="hint">{t('settings.regionHint')}</div>
      </div>
      <SaveBar
        label={t('common.save')}
        disabled={language === settings.language && timeZone === settings.timeZone}
        onSave={() => {
          saveSettings({ language, timeZone })
          pop()
        }}
      />
    </>
  )
}

/* --------------------------------------------------------------- health -- */

/**
 * Apple Health. The toggle is the whole connection: turning it on shows the
 * system permission sheet, then pulls the last month. Turning it off stops
 * LogPal reading and writing but cannot revoke anything on Apple's side,
 * which only the Health app can do, hence the hint.
 */
export function PrefsHealth() {
  const {
    pop,
    settings,
    saveSettings,
    healthBusy,
    healthLast,
    healthWrites,
    connectHealth,
    syncHealth,
  } = useApp()
  const t = useT()
  const [error, setError] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)

  const toggle = async (on: boolean) => {
    setError(null)
    if (!on) {
      saveSettings({ healthSync: false })
      return
    }
    setConnecting(true)
    try {
      await connectHealth()
    } catch (err) {
      setError(t('settings.healthFailed', { error: (err as Error).message }))
    } finally {
      setConnecting(false)
    }
  }

  const writeLabel: Record<string, string> = {
    waterMl: t('settings.healthWater'),
    weightKg: t('settings.healthWeight'),
    calories: t('settings.healthNutrition'),
    proteinG: t('settings.healthNutrition'),
    carbsG: t('settings.healthNutrition'),
    fatG: t('settings.healthNutrition'),
  }
  const deniedWrites = [
    ...new Set(
      Object.entries(healthWrites ?? {})
        .filter(([, s]) => s === 'denied')
        .map(([k]) => writeLabel[k] ?? k),
    ),
  ]

  let lastLine = t('settings.healthNever')
  if (healthLast?.error) lastLine = t('settings.healthFailed', { error: healthLast.error })
  else if (healthLast)
    lastLine = `${t('settings.healthLast', { time: timeOfDay(healthLast.at) })} · ${t(
      'settings.healthImported',
      { steps: healthLast.steps, weights: healthLast.weights, workouts: healthLast.workouts },
    )}`

  return (
    <>
      <TopBar title={t('settings.health')} onBack={pop} solid />
      <div className="scroll">
        <div className="card" style={{ marginTop: 12 }}>
          <Toggle
            label={t('settings.healthToggle')}
            sub={t('settings.healthToggleSub')}
            checked={settings.healthSync}
            onChange={(v) => void toggle(v)}
          />
        </div>
        {error && (
          <div className="hint" style={{ color: 'var(--danger)' }}>
            {error}
          </div>
        )}
        {settings.healthSync && (
          <>
            <div className="section-label">{t('settings.healthReads')}</div>
            <div className="card">
              <Row title={t('settings.healthSteps')} />
              <Row title={t('settings.healthWeight')} />
              <Row title={t('settings.healthWorkouts')} />
            </div>
            <div className="section-label">{t('settings.healthWrites')}</div>
            <div className="card">
              <Row title={t('settings.healthWater')} />
              <Row title={t('settings.healthWeight')} />
              <Row title={t('settings.healthNutrition')} />
            </div>
            {deniedWrites.length > 0 && (
              <div className="hint">{t('settings.healthWriteOff', { types: deniedWrites.join(', ') })}</div>
            )}
            <div className="btn-wrap">
              <button
                className="btn btn--ghost"
                disabled={healthBusy || connecting}
                onClick={() => void syncHealth()}
              >
                {healthBusy || connecting ? t('settings.healthSyncing') : t('settings.healthSyncNow')}
              </button>
            </div>
            <div className="hint">{lastLine}</div>
          </>
        )}
        <div className="hint">{t('settings.healthHint')}</div>
      </div>
    </>
  )
}

/* ----------------------------------------------------------- appearance -- */

export function PrefsAppearance() {
  const { pop, settings, saveSettings } = useApp()
  const t = useT()
  const [theme, setTheme] = useState(settings.theme)

  return (
    <>
      <TopBar title={t('settings.appearance')} onBack={pop} solid />
      <div className="scroll">
        <div className="card" style={{ marginTop: 12 }}>
          <SelectField
            label={t('settings.theme')}
            value={theme}
            onChange={setTheme}
            options={[
              { value: 'system', label: t('settings.matchSystem') },
              { value: 'light', label: t('settings.light') },
              { value: 'dark', label: t('settings.dark') },
            ]}
          />
        </div>
        <div className="hint">{t('settings.themeHint')}</div>
      </div>

      <SaveBar
        label={t('common.save')}
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
  const t = useT()

  /* No "reset all data" button here any more, by request. It was a one-tap
     path to irreversibly deleting a diary, sitting on an otherwise harmless
     information screen, and now that data syncs, it would wipe the account
     rather than just this browser. Signing out is on the Account screen;
     deleting an account is a deliberate enough act to belong elsewhere. */
  return (
    <>
      <TopBar title={t('settings.about')} onBack={pop} solid />
      <div className="scroll">
        <div className="card" style={{ marginTop: 12 }}>
          <Row title={t('settings.version')} value={`0.1.0 · ${__BUILD_SHA__}`} />
          <Row title={t('settings.foodData')} value="USDA + Open Food Facts" />
          <Row title={t('settings.calorieEquation')} value="Mifflin-St Jeor" />
        </div>

        <div className="hint">
          Whole-food nutrition comes from USDA FoodData Central; packaged products come
          from Open Food Facts, a community database. Calorie and hydration targets are
          estimates from standard equations, none of it is medical advice.
        </div>

        <div className="hint">
          {session
            ? 'Your diary syncs to your account, so it follows you between devices.'
            : 'You are signed out, so everything lives in this browser only. Clearing site data starts you over.'}
        </div>

        <div className="btn-wrap">
          <a className="btn btn--ghost" href="/privacy" target="_blank" rel="noreferrer">
            Privacy policy
          </a>
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

/**
 * Clear everything.
 *
 * Was removed from About by request, then asked for again. It earns its place
 * during testing, and the honest home for it is beside the account it affects
 * rather than on an otherwise harmless information screen.
 *
 * Behind a confirmation, and the wording changes with the situation: signed in
 * it takes the account with it, because clearing only this device would be a
 * lie. The next sync would pull everything straight back down.
 */
/**
 * Delete the account itself.
 *
 * Distinct from Clear all data, which empties an account and leaves it
 * standing. App Store Review Guideline 5.1.1(v) requires that an account
 * someone can create in the app can also be deleted in the app, without an
 * email to support. Behind a typed confirmation because it also releases the
 * username, and a tap on the wrong red button should not cost someone their
 * handle.
 */
function DeleteAccount() {
  const { deleteAccount } = useApp()
  const [confirming, setConfirming] = useState(false)
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const armed = typed.trim().toUpperCase() === 'DELETE'

  async function run() {
    setBusy(true)
    setError(null)
    try {
      await deleteAccount()
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <>
      <div className="section-label">Delete account</div>
      <div className="btn-wrap" style={{ paddingTop: 0 }}>
        <button className="btn btn--danger" onClick={() => setConfirming(true)}>
          Delete my account
        </button>
      </div>
      <div className="hint" style={{ color: 'var(--text-3)' }}>
        Permanently removes your account, your username, your diary and everything
        else stored under it. This cannot be undone.
      </div>

      {confirming && (
        <Dialog
          title="Delete your account?"
          onClose={() => {
            if (!busy) setConfirming(false)
          }}
        >
          <div style={{ color: 'var(--text-2)', marginBottom: 12, fontSize: 14 }}>
            Your account, username, diary, weight, measurements, fasts, custom foods,
            recipes and friends will be deleted everywhere. Type DELETE to confirm.
          </div>
          <input
            className="input"
            autoCapitalize="characters"
            autoComplete="off"
            placeholder="DELETE"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            disabled={busy}
            style={{ marginBottom: 12 }}
          />
          {error && (
            <div className="hint" style={{ color: 'var(--danger)', marginBottom: 8 }}>
              {error}
            </div>
          )}
          <button className="btn btn--danger" disabled={!armed || busy} onClick={() => void run()}>
            {busy ? 'Deleting…' : 'Delete account'}
          </button>
          <button
            className="btn btn--ghost"
            style={{ marginTop: 8 }}
            disabled={busy}
            onClick={() => setConfirming(false)}
          >
            Cancel
          </button>
        </Dialog>
      )}
    </>
  )
}

function ClearData() {
  const { resetAll, session } = useApp()
  const [confirming, setConfirming] = useState(false)

  return (
    <>
      <div className="section-label">Clear data</div>
      <div className="btn-wrap" style={{ paddingTop: 0 }}>
        <button className="btn btn--danger" onClick={() => setConfirming(true)}>
          Clear all data
        </button>
      </div>
      <div className="hint" style={{ color: 'var(--text-3)' }}>
        {session
          ? 'Deletes your diary, weight, measurements, fasts, custom foods and recipes, from this device and from your account on every other device.'
          : 'Deletes your diary, weight, measurements, fasts, custom foods and recipes from this browser.'}
      </div>

      {confirming && (
        <Dialog title="Clear everything?" onClose={() => setConfirming(false)}>
          <div style={{ color: 'var(--text-2)', marginBottom: 16, fontSize: 14 }}>
            {session
              ? 'This deletes your whole history from this device and from your account. Other devices lose it the next time they sync. It cannot be undone.'
              : 'This deletes your whole history from this browser. It cannot be undone.'}
          </div>
          <button
            className="btn btn--danger"
            onClick={() => {
              resetAll()
              setConfirming(false)
            }}
          >
            Delete everything
          </button>
          <button
            className="btn btn--ghost"
            style={{ marginTop: 8 }}
            onClick={() => setConfirming(false)}
          >
            Cancel
          </button>
        </Dialog>
      )}
    </>
  )
}
