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
import { analyseFood, type Insight } from '../lib/foodInsight'
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
export function WorthIt({ date, food: initial }: { date: string; food?: Food }) {
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
    return { food: other, n: on, fit: worthIt(on, budget), health: healthScore(on).score }
  }, [other, budget])

  if (!food || picking === 'second') {
    return (
      <>
        <TopBar
          title={picking === 'second' ? 'Compare with' : 'NutriScan'}
          onBack={picking === 'second' ? () => setPicking('first') : pop}
          solid
        />
        <div className="searchbar">
          <div className="searchbar__box">
            <Icon name="search" size={17} />
            <input
              className="searchbar__input"
              placeholder="Search a food or type a barcode"
              autoCapitalize="none"
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
          <div className="card">
            <Row
              left={<span className="avatar"><Icon name="barcode" size={18} /></span>}
              title="Scan a barcode"
              chevron
              onClick={() => push({ name: 'scan', date, mode: 'worth' })}
            />
          </div>

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
      <TopBar title="NutriScan" onBack={() => (initial ? pop() : setFood(null))} solid />
      <div className="scroll">
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

        {nutrients && (
          <div className="card">
            <Row title="Calories" value={`${cal(nutrients.calories)} cal`} />
            <Row
              title="Carbs · Fat · Protein"
              value={`${Math.round(nutrients.carbs)} · ${Math.round(nutrients.fat)} · ${Math.round(
                nutrients.protein,
              )} g`}
            />
            <Row title="Fibre" value={`${Math.round(nutrients.fiber)} g`} />
            <Row title="Left today" value={`${cal(Math.max(0, budget.caloriesLeft))} cal`} />
          </div>
        )}

        {fit && (
          <div className="card" style={{ padding: '10px 16px 14px' }}>
            {fit.notes.map((t) => (
              <div key={t} style={{ fontSize: 13.5, padding: '4px 0', color: 'var(--text-2)' }}>
                {t}
              </div>
            ))}
          </div>
        )}

        {insight && (insight.protein || insight.carbs || insight.fat) && (
          <div className="card">
            {insight.protein && <Row title="Protein" value={insight.protein} />}
            {insight.carbs && <Row title="Carbohydrate" value={insight.carbs} />}
            {insight.fat && <Row title="Fat" value={insight.fat} />}
          </div>
        )}

        {insight && <InsightList title="In its favour" items={insight.good} />}
        {insight && <InsightList title="Worth knowing" items={insight.watch} />}

        {otherSide && nutrients && fit && (
          <>
            <div className="section-label">Side by side</div>
            <Compare
              a={{ food, n: nutrients, fit, health: health?.score ?? 0 }}
              b={otherSide}
            />
            <div style={{ padding: '4px 16px 0' }}>
              <button className="textbtn" onClick={() => setOther(null)}>
                Clear comparison
              </button>
            </div>
          </>
        )}

        {/* The action bar is pinned, so the last card needs room to clear it. */}
        <div style={{ height: 96 }} />

        <div className="ractions">
          <button className="btn btn--ghost" onClick={() => setPicking('second')}>
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
  const rows: [string, string, string, number][] = [
    ['Fits your plan', a.fit.score.toFixed(1), b.fit.score.toFixed(1), a.fit.score - b.fit.score],
    ['Health score', a.health.toFixed(1), b.health.toFixed(1), a.health - b.health],
    ['Calories', cal(a.n.calories), cal(b.n.calories), b.n.calories - a.n.calories],
    ['Protein', `${Math.round(a.n.protein)} g`, `${Math.round(b.n.protein)} g`, a.n.protein - b.n.protein],
    ['Fibre', `${Math.round(a.n.fiber)} g`, `${Math.round(b.n.fiber)} g`, a.n.fiber - b.n.fiber],
    ['Sugar', `${Math.round(a.n.sugar)} g`, `${Math.round(b.n.sugar)} g`, b.n.sugar - a.n.sugar],
    ['Sodium', `${Math.round(a.n.sodium)} mg`, `${Math.round(b.n.sodium)} mg`, b.n.sodium - a.n.sodium],
  ]

  return (
    <>
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
