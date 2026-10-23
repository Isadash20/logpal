import { useEffect, useMemo, useState } from 'react'
import { MEAL_KEYS, PERIOD_LABELS, type FoodEntry, type MealKey, type Recipe } from '../types'
import { useApp } from '../state/store'
import { Icon } from '../components/Icon'
import { WeekStrip } from '../components/charts'
import { WidgetGrid } from '../components/WidgetGrid'
import { FoodMark } from '../components/FoodMark'
import { Confetti, celebratedToday, markCelebrated } from '../components/Confetti'
import { cal } from '../lib/format'
import { addDays, longDate, today } from '../lib/dates'
import { mlToDisplay, waterUnitLabel } from '../lib/units'
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

  /* Every macro target met is the one moment in the day worth marking, so it
     is marked once and then left alone. */
  const [celebrating, setCelebrating] = useState(false)
  useEffect(() => {
    if (!allMacrosMet || celebratedToday(date)) return
    markCelebrated(date)
    setCelebrating(true)
  }, [date, allMacrosMet])

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
    for (let i = 0; i < 7; i++) {
      const d = addDays(date, i - offset)
      out.push({
        label: ['M', 'T', 'W', 'T', 'F', 'S', 'S'][i],
        logged: totalsFor(d).nutrients.calories > 0,
        date: d,
        selected: d === date,
        isToday: d === realToday,
        future: d > realToday,
      })
    }
    return out
  }, [date, totalsFor])

  /* Arranging the board. Not persisted: it is a mode, not a preference, and
     coming back to Home in edit mode would be a small trap. */
  const [editing, setEditing] = useState(false)

  /* The eyebrow carries the full date, so the title must not repeat it. It
     names the day in relation to now instead, which is the thing the date
     itself cannot tell you at a glance. */
  const relative = isToday
    ? 'Today'
    : date === addDays(today(), -1)
      ? 'Yesterday'
      : date === addDays(today(), 1)
        ? 'Tomorrow'
        : null

  const [weekday, monthDay] = longDate(date).split(', ')
  const dayTitle = relative ?? weekday
  const dayEyebrow = relative ? `${weekday}, ${monthDay}` : monthDay

  /* ------------------------------------------------------------ insight -- */

  const firstName = profile.firstName || profile.name?.trim().split(' ')[0] || ''
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
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
    waterReadout: `${fmtWater(log.water)} of ${fmtWater(waterTarget)} ${waterUnitLabel(settings.waterUnit)}`,
    streak: logStreak,
    entries: entriesFor(date).length,
    mealsLogged,
    allMacrosMet,
  })

  const act = (a: InsightAction) => {
    if (a.kind === 'log') push({ name: 'foodSearch', date, meal: a.meal })
    else if (a.kind === 'water') push({ name: 'water', date })
    else if (a.kind === 'recipes') setTab('plan')
    else push({ name: 'diary' })
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

  const ideasTitle = hour < 11 ? 'Ideas for today' : hour < 15 ? 'Ideas for lunch' : 'Ideas for dinner'

  return (
    <>
      {celebrating && <Confetti onDone={() => setCelebrating(false)} />}

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
              <span className="pill" title={`${logStreak} days logged in a row`}>
                <span className="pill__flame">
                  <Icon name="flame" size={16} strokeWidth={2.2} />
                </span>
                <span className="num">{logStreak}</span>
              </span>
            )}
            <button
              className="pill pill--icon"
              onClick={() => setTab('more')}
              aria-label="Settings"
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
            {editing ? 'Done' : 'Edit widgets'}
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
              <span>Log again</span>
              <button
                className="textbtn"
                style={{ padding: 0 }}
                onClick={() => push({ name: 'foodSearch', date })}
              >
                Search
              </button>
            </div>
            <div className="qrail">
              {recents.map((e) => (
                <button
                  key={e.id}
                  className="qcard"
                  onClick={() => relog(e)}
                  aria-label={`Log ${e.name} again`}
                >
                  <FoodMark name={e.name} brand={e.brand} size={34} round />
                  <span className="qcard__name">{e.name}</span>
                  <span className="qcard__meta">{cal(e.nutrients.calories)} cal</span>
                  {justLogged === e.id && (
                    <span className="qcard__done" aria-live="polite">
                      <Icon name="check" size={20} strokeWidth={2.6} />
                      Logged
                    </span>
                  )}
                </button>
              ))}
            </div>
          </>
        )}

        {/* ---------------------------------------------------------- meals -- */}
        <div className="section-head">
          <span>Meals</span>
          <button className="textbtn" style={{ padding: 0 }} onClick={() => push({ name: 'diary' })}>
            Open diary
          </button>
        </div>

        <div className="card">
          {MEAL_KEYS.map((period) => {
            const items = entriesFor(date, period)
            const kcal = totals.byMeal[period].calories
            const tint = PERIOD_TINT[period]
            const label = PERIOD_LABELS[period]
            return (
              <div className="meal" key={period}>
                {/* The row body opens the diary once something is in it and
                    goes straight to search while it is empty; the round button
                    always logs. Two targets, both obvious, neither nested. */}
                <button
                  className="meal__body"
                  onClick={() =>
                    items.length
                      ? push({ name: 'diary' })
                      : push({ name: 'foodSearch', date, meal: period })
                  }
                  aria-label={items.length ? `${label} in the diary` : `Log ${label}`}
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
                      {items.length ? items.map((i) => i.name).join(', ') : 'Nothing logged yet'}
                    </span>
                  </span>
                  {items.length > 0 && (
                    <span className="meal__cal num">
                      {cal(kcal)}
                      <small>cal</small>
                    </span>
                  )}
                </button>
                <button
                  className="meal__add"
                  onClick={() => push({ name: 'foodSearch', date, meal: period })}
                  aria-label={`Add to ${label}`}
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
                All recipes
              </button>
            </div>
            <div className="hint" style={{ paddingTop: 0, paddingBottom: 10 }}>
              {proteinBehind
                ? `High in protein and under ${cal(Math.max(350, goal - consumed))} calories, which is what is left today.`
                : `Each one fits inside the ${cal(Math.max(350, goal - consumed))} calories left today.`}
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
                    {cal(calories)} cal · {Math.round(protein)} g protein
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
            {log.completed ? 'Day complete' : 'Complete diary'}
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
