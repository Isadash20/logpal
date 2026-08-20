import { useEffect, useMemo, useState } from 'react'
import type { Food, Nutrients } from '../types'
import { useApp } from '../state/store'
import { Icon } from '../components/Icon'
import { Empty, Row, TopBar } from '../components/ui'
import { NUTRIENT_BY_KEY } from '../data/nutrients'
import { cal } from '../lib/format'
import { scaleNutrients } from '../lib/nutrition'
import { healthScore } from '../lib/healthScore'
import { worthIt, type DayBudget, type WorthItScore } from '../lib/worthIt'
import { analyseFood, type FoodInsight, type Insight } from '../lib/foodInsight'
import { searchLocal } from '../services/foodSearch'
import { loadFoodDb, onFoodDbGrown } from '../services/foodDb'
import { lookupBarcode, searchProducts } from '../services/openFoodFacts'

/**
 * NutriScan: two questions about one food, answered side by side.
 *
 * The health score says whether it is nutritious. The worth-it score says
 * whether it earns a place in the day you are actually having, which depends
 * on what is left of it. They disagree often, and that is the point: a tin of
 * sardines is excellent and a poor idea with 150 calories to go.
 */
export function WorthIt({
  date,
  food: initial,
  asTab,
}: {
  date: string
  food?: Food
  /* As a tab there is nothing behind it, so the search view has no back arrow
     and backing out of a result returns to the search rather than the stack. */
  asTab?: boolean
}) {
  const { pop, push, data, totalsFor, macroTargets, settings } = useApp()
  const [food, setFood] = useState<Food | null>(initial ?? null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Food[]>([])
  const [remote, setRemote] = useState<Food[]>([])
  const [servingIdx, setServingIdx] = useState(0)
  const [count, setCount] = useState(1)
  const [dbSize, setDbSize] = useState(0)
  /* The food being compared against, and whether the search is currently
     looking for it. Two slots rather than a list: this is "this or that", and
     a third column would not fit on a phone anyway. */
  const [other, setOther] = useState<Food | null>(null)
  const [picking, setPicking] = useState<'first' | 'second'>('first')
  /* Two ways in, asked before anything else. A search box on arrival makes the
     screen look like the food search it is not, and hides the scanner, which is
     the faster route when the thing is in your hand. */
  const [stage, setStage] = useState<'choose' | 'search'>('choose')

  useEffect(() => {
    void loadFoodDb()
    return onFoodDbGrown(() => setDbSize((n) => n + 1))
  }, [])

  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) {
      setResults([])
      setRemote([])
      return
    }
    setResults(searchLocal(q, [...data.customFoods, ...Object.values(data.foodCache)], 25))
    if (!settings.useOpenFoodFacts) return
    const t = window.setTimeout(async () => {
      try {
        const found = /^\d{8,14}$/.test(q) ? [await lookupBarcode(q)] : await searchProducts(q)
        setRemote(found.filter(Boolean) as Food[])
      } catch {
        setRemote([])
      }
    }, 700)
    return () => window.clearTimeout(t)
  }, [query, data.customFoods, data.foodCache, settings.useOpenFoodFacts, dbSize])

  const totals = totalsFor(date)
  const credit = settings.exerciseAddsCalories ? totals.exerciseCalories : 0

  const budget = useMemo<DayBudget>(() => {
    const eaten = totals.nutrients
    return {
      caloriesLeft: totals.goal + credit - eaten.calories,
      calorieGoal: Math.max(1, totals.goal),
      proteinLeft: Math.max(0, macroTargets.protein - eaten.protein),
      proteinTarget: Math.max(1, macroTargets.protein),
      fiberTarget: data.profile.nutrientGoals.fiber ?? NUTRIENT_BY_KEY.fiber.dailyValue,
    }
  }, [totals, credit, macroTargets, data.profile.nutrientGoals])

  const serving = food?.servings[servingIdx] ?? food?.servings[0]
  const nutrients = useMemo(
    () => (food && serving ? scaleNutrients(food.nutrients, count * serving.multiplier) : null),
    [food, serving, count],
  )

  const health = nutrients ? healthScore(nutrients) : null
  const fit = nutrients ? worthIt(nutrients, budget) : null
  const insight = food && nutrients ? analyseFood(food, nutrients) : null

  /* The second food is always judged at one serving. Two foods with different
     serving counts is a comparison of portions rather than of foods. */
  const otherSide = useMemo(() => {
    if (!other) return null
    const s0 = other.servings[0]
    const on = scaleNutrients(other.nutrients, s0 ? s0.multiplier : 1)
    return {
      food: other,
      n: on,
      fit: worthIt(on, budget),
      health: healthScore(on).score,
      insight: analyseFood(other, on),
    }
  }, [other, budget])

  if (!food || picking === 'second') {
    const heading = picking === 'second' ? 'Compare with' : 'NutriScan'
    const back =
      stage === 'search'
        ? () => setStage('choose')
        : picking === 'second'
          ? () => setPicking('first')
          : asTab
            ? undefined
            : pop

    if (stage === 'choose') {
      return (
        <>
          <TopBar title={heading} onBack={back} solid />
          <div className="scroll">
            <div className="pickways">
              <button
                className="pickway"
                onClick={() => push({ name: 'scan', date, mode: 'worth' })}
              >
                <span className="pickway__icon">
                  <Icon name="barcode" size={38} />
                </span>
                <span className="pickway__label">Scan a barcode</span>
              </button>
              <button className="pickway" onClick={() => setStage('search')}>
                <span className="pickway__icon">
                  <Icon name="search" size={34} />
                </span>
                <span className="pickway__label">Manual search</span>
              </button>
            </div>
          </div>
        </>
      )
    }

    return (
      <>
        <TopBar title={heading} onBack={back} solid />
        <div className="searchbar">
          <div className="searchbar__box">
            <Icon name="search" size={17} />
            <input
              className="searchbar__input"
              placeholder="Search a food or type a barcode"
              autoCapitalize="none"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query && (
              <button onClick={() => setQuery('')} aria-label="Clear">
                <Icon name="close" size={17} />
              </button>
            )}
          </div>
        </div>

        <div className="scroll">
          {query.trim().length >= 2 && !results.length && !remote.length && (
            <Empty title="Nothing found" />
          )}

          {!!results.length && (
            <div className="card">
              {results.slice(0, 12).map((f) => (
                <FoodRow key={f.id} food={f} onPick={() => pick(f)} />
              ))}
            </div>
          )}

          {!!remote.length && (
            <>
              <div className="section-label">Open Food Facts</div>
              <div className="card">
                {remote.slice(0, 8).map((f) => (
                  <FoodRow key={f.id} food={f} onPick={() => pick(f)} />
                ))}
              </div>
            </>
          )}
        </div>
      </>
    )
  }

  return (
    <>
      <TopBar
        title="NutriScan"
        onBack={() => (initial && !asTab ? pop() : setFood(null))}
        solid
      />
      <div className="scroll">
        {/* Comparing comes first when there are two. The chart is the reason
            the second food was scanned, so it opens the screen and the full
            readings for each follow underneath it. */}
        {otherSide && nutrients && fit && (
          <>
            <Compare
              a={{ food, n: nutrients, fit, health: health?.score ?? 0 }}
              b={otherSide}
            />
            <div style={{ padding: '2px 16px 10px' }}>
              <button className="textbtn" style={{ padding: 0 }} onClick={() => setOther(null)}>
                Clear comparison
              </button>
            </div>
          </>
        )}

        <div className="pagetitle" style={{ paddingBottom: 2 }}>
          {food.name}
        </div>
        {food.brand && (
          <div className="hint" style={{ paddingTop: 0 }}>
            {food.brand}
          </div>
        )}

        {fit && (
          <div className="verdict">
            <div className="verdict__scores">
              <ScoreDial label="Fits your plan" value={fit.score} color={scoreColor(fit.score)} />
              <ScoreDial
                label="Health score"
                value={health?.score ?? 0}
                color={scoreColor(health?.score ?? 0)}
              />
            </div>
          </div>
        )}

        <div className="card">
          <Row title="Serving" value={serving?.label ?? '-'} />
          <div className="servings">
            <button
              className="servings__btn"
              onClick={() => setCount((c) => Math.max(0.5, c - 0.5))}
              aria-label="Fewer"
            >
              <Icon name="minus" size={18} />
            </button>
            <span className="num" style={{ fontWeight: 700, minWidth: 46, textAlign: 'center' }}>
              {count}
            </span>
            <button
              className="servings__btn"
              onClick={() => setCount((c) => c + 0.5)}
              aria-label="More"
            >
              <Icon name="plus" size={18} />
            </button>
            {food.servings.length > 1 && (
              <select
                className="select"
                value={servingIdx}
                onChange={(e) => setServingIdx(Number(e.target.value))}
              >
                {food.servings.map((s, i) => (
                  <option key={s.label} value={i}>
                    {s.label}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        {nutrients && <Facts n={nutrients} insight={insight} />}

        {insight && <InsightList title="In its favour" items={insight.good} />}
        {insight && <InsightList title="Worth knowing" items={insight.watch} />}

        {/* The second food in full, under the first, in the order they were
            scanned. */}
        {otherSide && (
          <>
            <div className="pagetitle" style={{ paddingBottom: 2, paddingTop: 10 }}>
              {otherSide.food.name}
            </div>
            {otherSide.food.brand && (
              <div className="hint" style={{ paddingTop: 0 }}>
                {otherSide.food.brand}
              </div>
            )}
            <div className="verdict">
              <div className="verdict__scores">
                <ScoreDial
                  label="Fits your plan"
                  value={otherSide.fit.score}
                  color={scoreColor(otherSide.fit.score)}
                />
                <ScoreDial
                  label="Health score"
                  value={otherSide.health}
                  color={scoreColor(otherSide.health)}
                />
              </div>
            </div>
            <div className="card">
              <Row title="Serving" value={otherSide.food.servings[0]?.label ?? '-'} />
            </div>
            <Facts n={otherSide.n} insight={otherSide.insight} />
            <InsightList title="In its favour" items={otherSide.insight.good} />
            <InsightList title="Worth knowing" items={otherSide.insight.watch} />
          </>
        )}

        {/* The action bar is pinned, so the last card needs room to clear it. */}
        <div style={{ height: 96 }} />

        <div className="ractions">
          <button
            className="btn btn--ghost"
            onClick={() => {
              setPicking('second')
              setStage('choose')
            }}
          >
            {otherSide ? 'Compare another' : 'Compare'}
          </button>
          <button
            className="btn btn--primary"
            onClick={() => push({ name: 'foodDetail', food, date, servings: count, servingLabel: serving?.label })}
          >
            Log it
          </button>
        </div>
      </div>
    </>
  )

  function pick(f: Food) {
    setQuery('')
    setStage('choose')
    if (picking === 'second') {
      setOther(f)
      setPicking('first')
      return
    }
    setFood(f)
    setServingIdx(0)
    setCount(1)
  }
}

function FoodRow({ food, onPick }: { food: Food; onPick(): void }) {
  return (
    <Row
      title={food.name}
      sub={[food.brand, `${cal(food.nutrients.calories)} cal`].filter(Boolean).join(' · ')}
      chevron
      onClick={onPick}
    />
  )
}

/* The dial carries the reading, not a word for it. Green, amber and red say
   how the number sits without the screen telling anyone what to do. */
function scoreColor(score: number): string {
  return score >= 7 ? 'var(--positive)' : score >= 4.5 ? 'var(--warning)' : 'var(--danger)'
}

/**
 * The reading itself, one figure a row.
 *
 * Carbohydrate, fat and protein used to share a line as "9 · 1 · 25 g", which
 * is fine on a diary entry and wrong here: this screen exists to be read
 * carefully, and three numbers behind one label cannot be. Where the food's
 * make-up is known, it sits beside the gram count rather than in a section of
 * its own.
 */
function Facts({ n, insight }: { n: Nutrients; insight: FoodInsight | null }) {
  return (
    <div className="card">
      <Row title="Calories" value={`${cal(n.calories)} cal`} />
      <Row title="Carbs" sub={insight?.carbs ?? undefined} value={`${Math.round(n.carbs)} g`} />
      <Row title="Fat" sub={insight?.fat ?? undefined} value={`${Math.round(n.fat)} g`} />
      <Row title="Protein" sub={insight?.protein ?? undefined} value={`${Math.round(n.protein)} g`} />
      <Row title="Fiber" value={`${Math.round(n.fiber)} g`} />
      <Row title="Sugar" value={`${Math.round(n.sugar)} g`} />
      <Row title="Sodium" value={`${Math.round(n.sodium)} mg`} />
    </div>
  )
}

function InsightList({ title, items }: { title: string; items: Insight[] }) {
  if (!items.length) return null
  return (
    <>
      <div className="section-label">{title}</div>
      <div className="card" style={{ padding: '6px 16px 12px' }}>
        {items.map((i) => (
          <div key={i.label} style={{ padding: '8px 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontWeight: 600 }}>
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: 999,
                  flex: 'none',
                  background: i.tone === 'good' ? 'var(--positive)' : 'var(--warning)',
                }}
              />
              {i.label}
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 2, lineHeight: 1.4 }}>
              {i.detail}
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

/** One food's figures beside another's, with the difference called out. */
function Compare({
  a,
  b,
}: {
  a: { food: Food; n: Nutrients; fit: WorthItScore; health: number }
  b: { food: Food; n: Nutrients; fit: WorthItScore; health: number }
}) {
  /* The fourth value is which side leads: positive for the left, negative for
     the right. Calories, sugar and sodium are inverted, since less of each is
     the better showing. */
  const rows: [string, string, string, number][] = [
    ['Fits your plan', a.fit.score.toFixed(1), b.fit.score.toFixed(1), a.fit.score - b.fit.score],
    ['Health score', a.health.toFixed(1), b.health.toFixed(1), a.health - b.health],
    ['Calories', cal(a.n.calories), cal(b.n.calories), b.n.calories - a.n.calories],
    ['Carbs', `${Math.round(a.n.carbs)} g`, `${Math.round(b.n.carbs)} g`, 0],
    ['Fat', `${Math.round(a.n.fat)} g`, `${Math.round(b.n.fat)} g`, 0],
    ['Protein', `${Math.round(a.n.protein)} g`, `${Math.round(b.n.protein)} g`, a.n.protein - b.n.protein],
    ['Fiber', `${Math.round(a.n.fiber)} g`, `${Math.round(b.n.fiber)} g`, a.n.fiber - b.n.fiber],
    ['Sugar', `${Math.round(a.n.sugar)} g`, `${Math.round(b.n.sugar)} g`, b.n.sugar - a.n.sugar],
    ['Sodium', `${Math.round(a.n.sodium)} mg`, `${Math.round(b.n.sodium)} mg`, b.n.sodium - a.n.sodium],
  ]

  const gap = a.fit.score - b.fit.score
  const leader = gap > 0 ? a : b
  const lead = Math.abs(gap)

  return (
    <>
      <div className="section-label">Side by side</div>

      <div className="card" style={{ padding: '12px 16px 14px', textAlign: 'center' }}>
        <div style={{ fontSize: 13, color: 'var(--text-2)' }}>Better for your plan</div>
        <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.02em', marginTop: 2 }}>
          {lead < 0.3 ? 'Line ball' : leader.food.name}
        </div>
        <div className="num" style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 2 }}>
          {a.fit.score.toFixed(1)} against {b.fit.score.toFixed(1)}
        </div>
      </div>

      <div className="cmp cmp--head">
        <span />
        <span className="cmp__name">{a.food.name}</span>
        <span className="cmp__name">{b.food.name}</span>
      </div>
      <div className="card" style={{ padding: '4px 12px 10px' }}>
        {rows.map(([label, left, right, delta]) => (
          <div key={label} className="cmp">
            <span className="cmp__label">{label}</span>
            <span className={`cmp__value ${delta > 0 ? 'cmp__value--lead' : ''}`}>{left}</span>
            <span className={`cmp__value ${delta < 0 ? 'cmp__value--lead' : ''}`}>{right}</span>
          </div>
        ))}
      </div>
    </>
  )
}

function ScoreDial({ label, value, color }: { label: string; value: number; color: string }) {
  const r = 30
  const c = 2 * Math.PI * r
  const filled = Math.min(1, Math.max(0, value / 10))
  return (
    <div style={{ display: 'grid', placeItems: 'center', gap: 4 }}>
      <svg width="92" height="92" viewBox="0 0 76 76" role="img" aria-label={`${value} out of 10`}>
        <circle cx="38" cy="38" r={r} fill="none" stroke="var(--surface-3)" strokeWidth="8" />
        {filled > 0 && (
          <circle
            cx="38"
            cy="38"
            r={r}
            fill="none"
            stroke={color}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${filled * c} ${c}`}
            transform="rotate(-90 38 38)"
          />
        )}
        <text
          x="38"
          y="38"
          textAnchor="middle"
          dominantBaseline="central"
          className="num"
          style={{ fontSize: 19, fontWeight: 800, fill: 'var(--text)' }}
        >
          {value}
        </text>
      </svg>
      <span style={{ fontSize: 12.5, color: 'var(--text-2)', fontWeight: 600 }}>{label}</span>
    </div>
  )
}
