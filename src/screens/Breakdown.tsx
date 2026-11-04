import { useState, type ReactNode } from 'react'
import { MEAL_KEYS, PERIOD_LABELS, type FoodEntry, type MealKey, type NutrientKey } from '../types'
import { useApp } from '../state/store'
import { Icon } from '../components/Icon'
import { Empty, Row, Sheet, SheetAction, TopBar } from '../components/ui'
import { Donut, Legend } from '../components/charts'
import { FoodMark } from '../components/FoodMark'
import { NUTRIENTS, NUTRIENT_BY_KEY, type NutrientDef } from '../data/nutrients'
import { cal, entrySubtitle, timeOfDay } from '../lib/format'
import { friendlyDate } from '../lib/dates'

/**
 * Where the day's numbers came from.
 *
 * Tapping a figure on Home used to open the plan editor, which answers a
 * question nobody tapping a number was asking. These three screens answer
 * the one they were: calories shows the arithmetic and which meal spent
 * them; macros shows the three against their targets and what provided
 * each; a nutrient shows every logged food that carried it, biggest first;
 * a meal is just its foods. The plan itself is edited under Settings, where
 * changing it is a decision rather than a slip.
 *
 * There is no diary page any more. It showed the whole day's arithmetic,
 * macros, water, food and exercise on one scroll, and opening it from a
 * meal row to see what breakfast was felt like being handed the ledger.
 */
const MEAL_COLORS = ['var(--accent)', 'var(--carbs)', 'var(--fat)', 'var(--protein)']

const MACROS: { key: 'protein' | 'carbs' | 'fat'; label: string; color: string; kcal: number }[] = [
  { key: 'protein', label: 'Protein', color: 'var(--protein)', kcal: 4 },
  { key: 'carbs', label: 'Carbs', color: 'var(--carbs)', kcal: 4 },
  { key: 'fat', label: 'Fat', color: 'var(--fat)', kcal: 9 },
]

function amount(v: number, def: NutrientDef): string {
  if (def.unit === 'cal') return `${cal(v)} cal`
  if (def.unit === '%') return `${Math.round(v)}%`
  const n = def.unit === 'g' && v < 10 && v !== Math.round(v) ? Math.round(v * 10) / 10 : Math.round(v)
  return `${n} ${def.unit}`
}

/* ------------------------------------------------------------- calories -- */

export function CaloriesScreen({ date }: { date: string }) {
  const { pop, push, totalsFor, entriesFor, settings, data } = useApp()
  const totals = totalsFor(date)
  const credit = settings.exerciseAddsCalories ? totals.exerciseCalories : 0
  const goal = totals.goal + credit
  const consumed = totals.nutrients.calories
  const left = goal - consumed
  const exercises = data.exerciseEntries.filter((e) => e.date === date)

  const slices = MEAL_KEYS.map((m, i) => ({
    label: PERIOD_LABELS[m],
    value: totals.byMeal[m].calories,
    color: MEAL_COLORS[i],
  }))

  return (
    <>
      <TopBar title={`Calories · ${friendlyDate(date)}`} onBack={pop} solid />
      <div className="scroll">
        <div className="hero hero--center">
          <div className="hero__big num" style={{ color: left < 0 ? 'var(--danger)' : 'var(--text)' }}>
            {cal(Math.abs(left))}
          </div>
          <div className="hero__caption">{left < 0 ? 'over for today' : 'left today'}</div>
          <div className="sum">
            <SumRow label="Your plan" value={cal(totals.goal)} />
            {settings.exerciseAddsCalories && (
              <SumRow label="Exercise" value={`+ ${cal(totals.exerciseCalories)}`} tone="var(--positive)" />
            )}
            <SumRow label="Food" value={`− ${cal(consumed)}`} tone="var(--accent)" />
            <SumRow label={left < 0 ? 'Over' : 'Left'} value={cal(Math.abs(left))} strong />
          </div>
        </div>

        <div className="section-label">Where it went</div>
        <div className="card">
          {consumed > 0 ? (
            <div style={{ display: 'flex', gap: 14, alignItems: 'center', padding: '16px 16px 6px' }}>
              <Donut
                size={116}
                thickness={20}
                slices={slices}
                center={
                  <>
                    <div className="num" style={{ fontSize: 22, fontWeight: 800 }}>
                      {cal(consumed)}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-2)' }}>eaten</div>
                  </>
                }
              />
              <Legend slices={slices} />
            </div>
          ) : (
            <Empty title="Nothing eaten yet" />
          )}
          {MEAL_KEYS.map((m, i) => {
            const items = entriesFor(date, m)
            return (
              <Row
                key={m}
                left={<span className="dotmark" style={{ background: MEAL_COLORS[i] }} />}
                title={PERIOD_LABELS[m]}
                sub={items.length ? items.map((e) => e.name).join(', ') : 'Nothing logged'}
                value={`${cal(totals.byMeal[m].calories)} cal`}
                chevron
                onClick={() => push({ name: 'meal', date, meal: m })}
              />
            )
          })}
        </div>

        <div className="section-label">Exercise</div>
        <div className="card">
          {exercises.length ? (
            exercises.map((e) => (
              <Row
                key={e.id}
                title={e.name}
                sub={e.minutes ? `${e.minutes} min` : e.sets ? `${e.sets} × ${e.reps ?? '–'}` : undefined}
                value={e.caloriesBurned ? `${cal(e.caloriesBurned)} cal` : '–'}
                onClick={() =>
                  push({ name: 'exerciseDetail', date, kind: e.kind, exerciseId: e.exerciseId, name_: e.name, entryId: e.id })
                }
                chevron
              />
            ))
          ) : (
            <Row title="No exercise logged" sub="Burned calories are added back to your day" />
          )}
          <Row
            title={
              <span style={{ color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Icon name="plus" size={16} strokeWidth={2.4} /> Log exercise
              </span>
            }
            onClick={() => push({ name: 'exerciseSearch', date, kind: 'cardio' })}
          />
        </div>

        <div className="hint">
          Your plan is {cal(totals.goal)} cal a day
          {settings.exerciseAddsCalories ? ', plus whatever you burn' : ''}. Change it under
          Settings → Goals.
        </div>
      </div>
    </>
  )
}

function SumRow({ label, value, tone, strong }: { label: string; value: string; tone?: string; strong?: boolean }) {
  return (
    <div className={`sum__row ${strong ? 'sum__row--strong' : ''}`}>
      <span>{label}</span>
      <span className="num" style={{ color: tone }}>
        {value}
      </span>
    </div>
  )
}

/* --------------------------------------------------------------- macros -- */

function topSources(entries: FoodEntry[], key: NutrientKey, n = 2): string {
  const named = entries
    .filter((e) => e.nutrients[key] > 0)
    .sort((a, b) => b.nutrients[key] - a.nutrients[key])
    .slice(0, n)
    .map((e) => e.name)
  return named.length ? `Mostly from ${named.join(' and ')}` : 'Nothing logged yet'
}

export function MacrosScreen({ date }: { date: string }) {
  const { pop, push, totalsFor, entriesFor, macroTargets, profile } = useApp()
  const n = totalsFor(date).nutrients
  const entries = entriesFor(date)
  const kcal = Math.max(1, n.calories)

  const extras = NUTRIENTS.filter(
    (d) => d.inTable && !['calories', 'carbs', 'fat', 'protein'].includes(d.key),
  )

  return (
    <>
      <TopBar title={`Macros · ${friendlyDate(date)}`} onBack={pop} solid />
      <div className="scroll">
        <div className="section-label">Tap one to see where it came from</div>
        {MACROS.map((m) => {
          const now = n[m.key]
          const target = macroTargets[m.key]
          const ratio = target > 0 ? Math.min(1, now / target) : 0
          const share = Math.round(((now * m.kcal) / kcal) * 100)
          return (
            <button key={m.key} className="macrocard" onClick={() => push({ name: 'nutrient', date, key: m.key })}>
              <span className="macrocard__head">
                <span className="dotmark" style={{ background: m.color }} />
                <span className="macrocard__label">{m.label}</span>
                <span className="num macrocard__value" style={{ color: m.color }}>
                  {Math.round(now)}
                  <span className="macrocard__unit"> / {target} g</span>
                </span>
                <span className="row__chev">
                  <Icon name="forward" size={18} />
                </span>
              </span>
              <span className="rating__bar" style={{ marginTop: 8 }}>
                <span style={{ width: `${ratio * 100}%`, background: m.color }} />
              </span>
              <span className="macrocard__sub">
                {n.calories > 0 ? `${share}% of today's calories · goal ${profile.macroSplit[m.key]}%` : `Goal ${profile.macroSplit[m.key]}% of calories`}
              </span>
              <span className="macrocard__sub">{topSources(entries, m.key)}</span>
            </button>
          )
        })}

        <div className="section-label">Everything else</div>
        <div className="card">
          {extras.map((d) => {
            const goal = goalFor(d, profile.nutrientGoals)
            return (
              <Row
                key={d.key}
                title={<span style={{ paddingLeft: d.indent ? 14 : 0 }}>{d.label}</span>}
                value={
                  <span className="num">
                    {amount(n[d.key], d)}
                    {goal > 0 && <span style={{ color: 'var(--text-3)' }}> / {amount(goal, d)}</span>}
                  </span>
                }
                chevron
                onClick={() => push({ name: 'nutrient', date, key: d.key })}
              />
            )
          })}
        </div>
      </div>
    </>
  )
}

function goalFor(d: NutrientDef, overrides: Partial<Record<NutrientKey, number>>): number {
  return overrides[d.key] ?? d.dailyValue
}

/* ------------------------------------------------------------- nutrient -- */

export function NutrientScreen({ date, nutrient }: { date: string; nutrient: NutrientKey }) {
  const { pop, push, entriesFor, macroTargets, calorieTarget, profile } = useApp()
  const def = NUTRIENT_BY_KEY[nutrient]
  const entries = entriesFor(date)
    .filter((e) => e.nutrients[nutrient] > 0)
    .sort((a, b) => b.nutrients[nutrient] - a.nutrients[nutrient])
  const total = entriesFor(date).reduce((s, e) => s + e.nutrients[nutrient], 0)
  const goal =
    nutrient === 'calories'
      ? calorieTarget
      : nutrient === 'protein' || nutrient === 'carbs' || nutrient === 'fat'
        ? macroTargets[nutrient]
        : goalFor(def, profile.nutrientGoals)
  const macro = MACROS.find((m) => m.key === nutrient)
  const color = macro?.color ?? 'var(--accent)'
  const title = macro?.label ?? def.label

  return (
    <>
      <TopBar title={`${title} · ${friendlyDate(date)}`} onBack={pop} solid />
      <div className="scroll">
        <div className="hero hero--center">
          <div className="hero__big num" style={{ color }}>
            {amount(total, def)}
          </div>
          <div className="hero__caption">
            {goal > 0 ? `of ${amount(goal, def)} ${nutrient === 'calories' ? 'planned' : 'goal'}` : 'today'}
          </div>
          {goal > 0 && (
            <span className="rating__bar" style={{ marginTop: 12 }}>
              <span style={{ width: `${Math.min(100, (total / goal) * 100)}%`, background: color }} />
            </span>
          )}
        </div>

        <div className="section-label">Where it came from</div>
        {entries.length ? (
          <div className="card">
            {entries.map((e) => (
              <Source key={e.id} entry={e} share={total > 0 ? e.nutrients[nutrient] / total : 0} color={color} value={amount(e.nutrients[nutrient], def)} />
            ))}
          </div>
        ) : (
          <div className="card">
            <Empty title={`No ${title.toLowerCase()} logged yet`}>
              <button className="textbtn" onClick={() => push({ name: 'foodSearch', date })}>
                Log a food
              </button>
            </Empty>
          </div>
        )}
      </div>
    </>
  )
}

function Source({ entry, share, color, value }: { entry: FoodEntry; share: number; color: string; value: ReactNode }) {
  const sub = `${PERIOD_LABELS[entry.meal]} · ${entry.servings} × ${entry.servingLabel}`
  return (
    <div className="nb">
      <FoodMark name={entry.name} brand={entry.brand} size={34} />
      <span className="nb__main">
        <span className="nb__head">
          <span className="nb__name">{entry.name}</span>
          <span className="num nb__value">{value}</span>
        </span>
        <span className="rating__bar">
          <span style={{ width: `${Math.round(share * 100)}%`, background: color }} />
        </span>
        <span className="nb__sub">
          <span>{sub}</span>
          <span className="num">{Math.round(share * 100)}%</span>
        </span>
      </span>
    </div>
  )
}

/* ----------------------------------------------------------------- meal -- */

/** One meal's foods, and nothing else. */
export function MealScreen({ date, meal }: { date: string; meal: MealKey }) {
  const app = useApp()
  const { pop, push, entriesFor, totalsFor } = app
  const [menu, setMenu] = useState<FoodEntry | null>(null)
  const entries = entriesFor(date, meal)
  const kcal = totalsFor(date).byMeal[meal].calories

  return (
    <>
      <TopBar title={`${PERIOD_LABELS[meal]} · ${friendlyDate(date)}`} onBack={pop} solid />
      <div className="scroll">
        <div className="card" style={{ marginTop: 12 }}>
          {entries.length === 0 && <Empty title="Nothing logged yet" />}
          {entries.map((e) => (
            <Row
              key={e.id}
              left={<FoodMark name={e.name} brand={e.brand} size={34} />}
              title={e.name}
              sub={entrySubtitle({ brand: e.brand, servings: e.servings, servingLabel: e.servingLabel })}
              value={`${cal(e.nutrients.calories)} cal`}
              right={
                <span className="num" style={{ fontSize: 11, color: 'var(--text-3)', flex: 'none' }}>
                  {timeOfDay(e.loggedAt)}
                </span>
              }
              onClick={() => {
                const food = app.resolveFood(e.foodId)
                if (food) {
                  push({ name: 'foodDetail', food, date, meal, entryId: e.id, servings: e.servings, servingLabel: e.servingLabel })
                } else {
                  setMenu(e)
                }
              }}
            />
          ))}
          {entries.length > 0 && (
            <div className="totals">
              <span>Total</span>
              <span className="totals__value">{cal(kcal)} cal</span>
            </div>
          )}
        </div>

        <div className="btn-wrap">
          <button className="btn" onClick={() => push({ name: 'foodSearch', date, meal })}>
            <Icon name="plus" size={19} strokeWidth={2.4} />
            Log food
          </button>
        </div>
        {entries.length > 0 && (
          <div className="hint">Tap a food to change the serving, move it, or remove it.</div>
        )}
      </div>

      {menu && (
        <Sheet title={menu.name} onClose={() => setMenu(null)}>
          {MEAL_KEYS.filter((m) => m !== menu.meal).map((m) => (
            <SheetAction
              key={m}
              icon="clock"
              label={`Move to ${PERIOD_LABELS[m]}`}
              onClick={() => {
                app.moveEntry(menu.id, m)
                setMenu(null)
              }}
            />
          ))}
          <SheetAction
            icon="trash"
            label="Delete entry"
            danger
            onClick={() => {
              app.deleteEntry(menu.id)
              setMenu(null)
            }}
          />
        </Sheet>
      )}
    </>
  )
}
