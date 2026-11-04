import { useEffect, useMemo, useState } from 'react'
import { MEAL_KEYS, PERIOD_LABELS, type FoodEntry, type MealKey, type Recipe } from '../types'
import { useApp } from '../state/store'
import { Icon } from '../components/Icon'
import { WeekStrip } from '../components/charts'
import { WidgetGrid } from '../components/WidgetGrid'
import { FoodMark } from '../components/FoodMark'
import { celebrate } from '../components/Confetti'
import { achievementsFor, markCelebrated, uncelebrated } from '../lib/celebrations'
import { App as CapApp } from '@capacitor/app'
import { cal } from '../lib/format'
import { addDays, longDate, today, weekdayInitials } from '../lib/dates'
import { useT } from '../i18n'
import { lbToDisplay, mlToDisplay, waterUnitLabel } from '../lib/units'
import { dayInsight, type InsightAction } from '../lib/dayInsight'
import { catalogRecipes, catalogSize, loadCatalog, onCatalogLoaded } from '../services/recipeDb'
import { summarise } from '../services/recipes'

/**
 * Home.
 *
 * Laid out the way the trackers studied for DESIGN.md lay out their day
 * screen, and then given the things a page of numbers was missing: a
 * greeting with one sentence about the day, the foods logged before as a
 * one-tap rail, the day's meals as rows, and a few recipes with photographs
 * that fit what is left. Content on white, nothing to scroll past before
 * the numbers.
 */
export function Today() {
  const app = useApp()
  const t = useT()
  const {
    data,
    date,
    setDate,
    totalsFor,
    dayLog,
    macroTargets,
    waterTarget,
    settings,
    profile,
    logStreak,
    push,
    setTab,
    entriesFor,
    resolveFood,
    logFood,
  } = app

  const totals = totalsFor(date)
  const log = dayLog(date)
  const isToday = date === today()
  const hour = new Date().getHours()
  const credit = settings.exerciseAddsCalories ? totals.exerciseCalories : 0
  const goal = totals.goal + credit
  const consumed = totals.nutrients.calories

  const allMacrosMet =
    totals.nutrients.protein >= macroTargets.protein &&
    totals.nutrients.carbs >= macroTargets.carbs &&
    totals.nutrients.fat >= macroTargets.fat

  /* Goals met are cheered once each: on the change that meets them, or at
     the next opening if it happened while the app was away. The tick makes
     the check re-run when the app comes to the front, which is what catches
     a fast that ticked over in a pocket. */
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') setTick((n) => n + 1)
    }
    document.addEventListener('visibilitychange', onVisible)
    const sub = CapApp.addListener('appStateChange', ({ isActive }) => {
      if (isActive) setTick((n) => n + 1)
    })
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      void sub.then((s) => s.remove()).catch(() => undefined)
    }
  }, [])

  useEffect(() => {
    if (!isToday) return
    const waterShown = mlToDisplay(log.water, settings.waterUnit)
    const items = achievementsFor({
      date,
      consumed,
      goal,
      nutrients: totals.nutrients,
      macroTargets,
      log,
      waterTarget,
      waterText: `${settings.waterUnit === 'ml' ? Math.round(waterShown) : Math.round(waterShown * 10) / 10} ${waterUnitLabel(settings.waterUnit)}`,
      profile,
      latestWeight: data.weights.length ? app.latestWeight : null,
      fasts: data.fasts,
      now: Date.now(),
      weightText: `${Math.round(lbToDisplay(app.latestWeight, settings.weightUnit) * 10) / 10} ${settings.weightUnit}`,
    })
    const fresh = uncelebrated(items)
    if (!fresh.length) return
    markCelebrated(fresh)
    celebrate(fresh)
  }, [isToday, date, consumed, goal, totals.nutrients, macroTargets, log, waterTarget, settings, profile, data.fasts, data.weights.length, app.latestWeight, tick])

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
    const initials = weekdayInitials('monday')
    for (let i = 0; i < 7; i++) {
      const d = addDays(date, i - offset)
      out.push({
        label: initials[i],
        logged: totalsFor(d).nutrients.calories > 0,
        date: d,
        selected: d === date,
        isToday: d === realToday,
        future: d > realToday,
      })
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, totalsFor, t])

  /* Arranging the board. Not persisted: it is a mode, not a preference, and
     coming back to Home in edit mode would be a small trap. */
  const [editing, setEditing] = useState(false)

  /* The eyebrow carries the full date, so the title must not repeat it. It
     names the day in relation to now instead, which is the thing the date
     itself cannot tell you at a glance. */
  const relative = isToday
    ? t('common.today')
    : date === addDays(today(), -1)
      ? t('common.yesterday')
      : date === addDays(today(), 1)
        ? t('common.tomorrow')
        : null

  const long = longDate(date)
  const comma = long.indexOf(', ')
  const weekday = comma > 0 ? long.slice(0, comma) : long
  const monthDay = comma > 0 ? long.slice(comma + 2) : ''
  const dayTitle = relative ?? weekday
  const dayEyebrow = relative ? long : monthDay

  /* ------------------------------------------------------------ insight -- */

  const firstName = profile.firstName || profile.name?.trim().split(' ')[0] || ''
  const greeting =
    hour < 12 ? t('home.goodMorning') : hour < 17 ? t('home.goodAfternoon') : t('home.goodEvening')
  const greetingLine = firstName ? `${greeting}, ${firstName}` : greeting

  const fmtWater = (ml: number) => {
    const v = mlToDisplay(ml, settings.waterUnit)
    return settings.waterUnit === 'ml' ? Math.round(v) : Math.round(v * 10) / 10
  }
  const mealsLogged = MEAL_KEYS.filter((m) => entriesFor(date, m).length > 0)
  const insight = dayInsight({
    hour,
    isToday,
    consumed,
    goal,
    protein: totals.nutrients.protein,
    proteinTarget: macroTargets.protein,
    water: log.water,
    waterTarget,
    waterReadout: t('home.waterReadout', {
      have: fmtWater(log.water),
      want: fmtWater(waterTarget),
      unit: waterUnitLabel(settings.waterUnit),
    }),
    streak: logStreak,
    entries: entriesFor(date).length,
    mealsLogged,
    allMacrosMet,
  })

  const act = (a: InsightAction) => {
    if (a.kind === 'log') push({ name: 'foodSearch', date, meal: a.meal })
    else if (a.kind === 'water') push({ name: 'water', date })
    else if (a.kind === 'recipes') setTab('plan')
    else push({ name: 'calories', date })
  }

  /* ---------------------------------------------------------- log again -- */

  /* The last ten distinct foods, newest first. Most meals are repeats, and a
     repeat should be one tap, not a search. */
  const recents = useMemo(() => {
    const seen = new Set<string>()
    const out: FoodEntry[] = []
    const sorted = [...data.foodEntries].sort((a, b) => b.loggedAt - a.loggedAt)
    for (const e of sorted) {
      const key = e.foodId || e.name
      if (seen.has(key)) continue
      seen.add(key)
      out.push(e)
      if (out.length >= 10) break
    }
    return out
  }, [data.foodEntries])

  const [justLogged, setJustLogged] = useState<string | null>(null)
  const relog = (e: FoodEntry) => {
    const food = resolveFood(e.foodId)
    if (!food) {
      push({ name: 'foodSearch', date })
      return
    }
    logFood({
      food,
      date,
      servings: e.servings,
      servingLabel: e.servingLabel,
      nutrients: e.nutrients,
    })
    setJustLogged(e.id)
    window.setTimeout(() => setJustLogged((v) => (v === e.id ? null : v)), 1400)
  }

  /* -------------------------------------------------------------- ideas -- */

  const [catalogReady, setCatalogReady] = useState(() => catalogSize() > 0)
  useEffect(() => {
    if (catalogReady) return
    loadCatalog()
      .then(() => setCatalogReady(true))
      .catch(() => undefined)
    return onCatalogLoaded(() => setCatalogReady(true))
  }, [catalogReady])

  const proteinBehind = totals.nutrients.protein < macroTargets.protein * 0.6
  const ideas = useMemo((): { recipe: Recipe; calories: number; protein: number }[] => {
    if (!catalogReady || !isToday) return []
    const room = Math.max(350, goal - consumed)
    const extra = [...data.customFoods, ...Object.values(data.foodCache)]
    const fits = catalogRecipes()
      .filter((r) => r.imageUrl && r.tags?.includes('Main dish'))
      .map((r) => {
        const n = summarise(r, extra).perServing
        return { recipe: r, calories: n.calories, protein: n.protein }
      })
      .filter((x) => x.calories >= 180 && x.calories <= room)
    if (fits.length === 0) return []
    /* When protein is behind, the richest in protein. Otherwise a slice of
       the catalogue that moves on each day, so the rail is not the same six
       dishes every evening. */
    if (proteinBehind) {
      fits.sort((a, b) => b.protein - a.protein)
      return fits.slice(0, 8)
    }
    const seed = Number(date.replace(/-/g, '')) % fits.length
    return [...fits.slice(seed), ...fits.slice(0, seed)].slice(0, 8)
  }, [catalogReady, isToday, goal, consumed, data.customFoods, data.foodCache, proteinBehind, date])

  const ideasTitle =
    hour < 11 ? t('home.ideasToday') : hour < 15 ? t('home.ideasLunch') : t('home.ideasDinner')

  return (
    <>
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
              <span className="pill pill--streak" title={t('home.streak', { n: logStreak })}>
                <span className="pill__flame">
                  <Icon name="flame" size={26} strokeWidth={2.4} />
                </span>
                <span className="num">{logStreak}</span>
              </span>
            )}
            <button
              className="pill pill--icon"
              onClick={() => setTab('more')}
              aria-label={t('tabs.settings')}
            >
              <Icon name="settings" size={19} />
            </button>
          </div>

          <WeekStrip days={week} onPick={setDate} />
        </div>

        {/* ------------------------------------------------------- insight -- */}
        {insight && (
          <div className={`insight insight--${insight.tone}`}>
            <span className="insight__mark">
              <Icon
                name={insight.tone === 'good' ? 'check' : insight.tone === 'warn' ? 'info' : 'sparkle'}
                size={18}
                strokeWidth={2.2}
              />
            </span>
            <div className="insight__main">
              <span className="insight__head">{greetingLine}</span>
              <span className="insight__text">{insight.text}</span>
              {insight.action && (
                <button className="insight__action" onClick={() => act(insight.action!)}>
                  {insight.action.label}
                  <Icon name="forward" size={14} strokeWidth={2.4} />
                </button>
              )}
            </div>
          </div>
        )}

        <div className="boardbar">
          <button className="boardbar__btn" onClick={() => setEditing((v) => !v)}>
            {editing ? t('common.done') : t('home.editWidgets')}
          </button>
        </div>

        {/* --------------------------------------------------------- board -- */}
        {/* Which of these matter is personal. A fasting timer to one person,
            calories to another, step counts to nobody at all, so the board is
            arranged rather than fixed. See lib/widgetLayout.ts. */}
        <WidgetGrid date={date} editing={editing} onEditingChange={setEditing} />

        {/* ----------------------------------------------------- log again -- */}
        {recents.length >= 2 && (
          <>
            <div className="section-head" style={{ paddingTop: 14 }}>
              <span>{t('home.logAgain')}</span>
              <button
                className="textbtn"
                style={{ padding: 0 }}
                onClick={() => push({ name: 'foodSearch', date })}
              >
                {t('common.search')}
              </button>
            </div>
            <div className="qrail">
              {recents.map((e) => (
                <button
                  key={e.id}
                  className="qcard"
                  onClick={() => relog(e)}
                  aria-label={t('home.logAgainAria', { name: e.name })}
                >
                  <FoodMark name={e.name} brand={e.brand} size={34} round />
                  <span className="qcard__name">{e.name}</span>
                  <span className="qcard__meta">
                    {cal(e.nutrients.calories)} {t('common.cal')}
                  </span>
                  {justLogged === e.id && (
                    <span className="qcard__done" aria-live="polite">
                      <Icon name="check" size={20} strokeWidth={2.6} />
                      {t('home.logged')}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </>
        )}

        {/* ---------------------------------------------------------- meals -- */}
        <div className="section-head">
          <span>{t('home.meals')}</span>
          <button className="textbtn" style={{ padding: 0 }} onClick={() => push({ name: 'calories', date })}>
            {t('home.openDiary')}
          </button>
        </div>

        <div className="card">
          {MEAL_KEYS.map((period) => {
            const items = entriesFor(date, period)
            const kcal = totals.byMeal[period].calories
            const tint = PERIOD_TINT[period]
            const label = t(`meal.${period}`, undefined, PERIOD_LABELS[period])
            return (
              <div className="meal" key={period}>
                {/* The row body opens the diary once something is in it and
                    goes straight to search while it is empty; the round button
                    always logs. Two targets, both obvious, neither nested. */}
                <button
                  className="meal__body"
                  onClick={() =>
                    items.length
                      ? push({ name: 'meal', date, meal: period })
                      : push({ name: 'foodSearch', date, meal: period })
                  }
                  aria-label={
                    items.length ? t('home.inDiary', { meal: label }) : t('home.logMeal', { meal: label })
                  }
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
                      {items.length ? items.map((i) => i.name).join(', ') : t('home.nothingYet')}
                    </span>
                  </span>
                  {items.length > 0 && (
                    <span className="meal__cal num">
                      {cal(kcal)}
                      <small>{t('common.cal')}</small>
                    </span>
                  )}
                </button>
                <button
                  className="meal__add"
                  onClick={() => push({ name: 'foodSearch', date, meal: period })}
                  aria-label={t('home.addTo', { meal: label })}
                >
                  <Icon name="plus" size={18} strokeWidth={2.4} />
                </button>
              </div>
            )
          })}
        </div>

        {/* ---------------------------------------------------------- ideas -- */}
        {ideas.length > 0 && (
          <>
            <div className="section-head" style={{ paddingTop: 14 }}>
              <span>{ideasTitle}</span>
              <button className="textbtn" style={{ padding: 0 }} onClick={() => setTab('plan')}>
                {t('home.allRecipes')}
              </button>
            </div>
            <div className="hint" style={{ paddingTop: 0, paddingBottom: 10 }}>
              {t(proteinBehind ? 'home.ideasHintProtein' : 'home.ideasHint', {
                cal: cal(Math.max(350, goal - consumed)),
              })}
            </div>
            <div className="qrail">
              {ideas.map(({ recipe, calories, protein }) => (
                <button
                  key={recipe.id}
                  className="idea"
                  onClick={() => push({ name: 'recipeView', recipeId: recipe.id, date })}
                >
                  <img className="idea__img" src={recipe.imageUrl} alt="" loading="lazy" />
                  <span className="idea__name">{recipe.name}</span>
                  <span className="idea__meta">
                    {t('home.ideaMeta', { cal: cal(calories), protein: Math.round(protein) })}
                  </span>
                </button>
              ))}
            </div>
          </>
        )}

        <div className="btn-wrap" style={{ paddingTop: 12 }}>
          <button
            className="btn btn--ghost"
            onClick={() => app.setCompleted(date, !log.completed)}
          >
            {log.completed && <Icon name="check" size={18} strokeWidth={2.4} />}
            {log.completed ? t('home.dayComplete') : t('home.completeDiary')}
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
const PERIOD_TINT: Record<MealKey, string> = {
  morning: 'var(--warning)',
  afternoon: 'var(--fat)',
  evening: 'var(--accent)',
  late: 'var(--sleep)',
}
