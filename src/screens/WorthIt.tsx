import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Food, Nutrients } from '../types'
import { useApp } from '../state/store'
import { useWorthSession, worthSession } from '../state/worthSession'
import { Icon } from '../components/Icon'
import { Empty, Row, TopBar } from '../components/ui'
import { NUTRIENT_BY_KEY } from '../data/nutrients'
import { cal } from '../lib/format'
import { scaleNutrients } from '../lib/nutrition'
import { healthScore } from '../lib/healthScore'
import { worthIt, type DayBudget, type WorthItScore } from '../lib/worthIt'
import { analyseFood, type FoodInsight, type Insight } from '../lib/foodInsight'
import { sourceRatings, type Rating, type SourceRatings } from '../lib/sourceRatings'
import { searchLocal } from '../services/foodSearch'
import { loadFoodDb, onFoodDbGrown } from '../services/foodDb'
import { lookupBarcode, searchProducts } from '../services/openFoodFacts'

/**
 * NutriScan: what one food is, and how two foods compare.
 *
 * The health score is the headline, big and in colour, because it is the
 * reason the screen was opened. Under it, four ratings say *what kind* of
 * food it is: a protein source, a carb source, a fat source, and how clean it
 * is. Then the figures. Nothing here logs anything; the diary has its own
 * doors. The one action is to put a second food beside the first.
 *
 * The pair being compared lives in `worthSession`, not in this component,
 * because scanning the second food unmounts this screen.
 */
interface Side {
  food: Food
  n: Nutrients
  fit: WorthItScore
  health: number
  insight: FoodInsight
  ratings: SourceRatings
}

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
  const session = useWorthSession()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Food[]>([])
  const [remote, setRemote] = useState<Food[]>([])
  const [servingIdx, setServingIdx] = useState(0)
  const [count, setCount] = useState(1)
  const [dbSize, setDbSize] = useState(0)
  /* Two ways in, asked before anything else. A search box on arrival makes the
     screen look like the food search it is not, and hides the scanners, which
     are the faster route when the thing is in your hand. */
  const [stage, setStage] = useState<'choose' | 'search'>('choose')

  useEffect(() => {
    if (initial) worthSession.deliver(initial)
  }, [initial])

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

  const food = session.first
  const serving = food?.servings[servingIdx] ?? food?.servings[0]

  const first = useMemo<Side | null>(() => {
    if (!food || !serving) return null
    const n = scaleNutrients(food.nutrients, count * serving.multiplier)
    return side(food, n, budget)
  }, [food, serving, count, budget])

  /* The second food is always judged at one serving. Two foods with different
     serving counts is a comparison of portions rather than of foods. */
  const second = useMemo<Side | null>(() => {
    const f = session.second
    if (!f) return null
    const s0 = f.servings[0]
    return side(f, scaleNutrients(f.nutrients, s0 ? s0.multiplier : 1), budget)
  }, [session.second, budget])

  const choosing = !food || session.picking === 'second'

  if (choosing) {
    const heading = session.picking === 'second' ? 'Compare with' : 'NutriScan'
    const back =
      stage === 'search'
        ? () => setStage('choose')
        : session.picking === 'second'
          ? () => worthSession.pick('first')
          : asTab
            ? undefined
            : pop

    if (stage === 'choose') {
      return (
        <>
          <TopBar title={heading} onBack={back} solid />
          <div className="scroll">
            {session.picking === 'second' && food && (
              <div className="hint" style={{ paddingTop: 12 }}>
                Pick a second food to set beside {food.name}.
              </div>
            )}
            <div className="pickways pickways--three">
              <button className="pickway" onClick={() => push({ name: 'scan', date, mode: 'worth' })}>
                <span className="pickway__icon">
                  <Icon name="barcode" size={34} />
                </span>
                <span className="pickway__label">Scan a barcode</span>
              </button>
              <button className="pickway" onClick={() => push({ name: 'nutriScan', date, mode: 'worth' })}>
                <span className="pickway__icon">
                  <Icon name="nutriscan" size={34} />
                </span>
                <span className="pickway__label">Scan a label</span>
              </button>
              <button className="pickway" onClick={() => setStage('search')}>
                <span className="pickway__icon">
                  <Icon name="search" size={30} />
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
        onBack={() => {
          worthSession.reset()
          setServingIdx(0)
          setCount(1)
          if (!asTab) pop()
        }}
        solid
      />
      <div className="scroll">
        {first && second ? (
          <>
            <Compare a={first} b={second} />
            <div style={{ padding: '0 16px 6px', textAlign: 'center' }}>
              <button className="textbtn" style={{ padding: 0 }} onClick={() => worthSession.clearSecond()}>
                Clear comparison
              </button>
            </div>
            <Detail
              side={first}
              tag={<Tag n={1} />}
              serving={
                <ServingPicker
                  food={first.food}
                  count={count}
                  setCount={setCount}
                  servingIdx={servingIdx}
                  setServingIdx={setServingIdx}
                />
              }
            />
            <Detail side={second} tag={<Tag n={2} />} />
          </>
        ) : (
          first && (
            <Detail
              side={first}
              serving={
                <ServingPicker
                  food={first.food}
                  count={count}
                  setCount={setCount}
                  servingIdx={servingIdx}
                  setServingIdx={setServingIdx}
                />
              }
            />
          )
        )}
        <div style={{ height: 12 }} />
      </div>

      {/* One verb. Logging has its own doors; this screen is for reading. */}
      <div className="ractions">
        <button
          className="btn btn--primary"
          onClick={() => {
            worthSession.pick('second')
            setStage('choose')
          }}
        >
          {second ? 'Compare another' : 'Compare with another food'}
        </button>
      </div>
    </>
  )

  function pick(f: Food) {
    setQuery('')
    setStage('choose')
    if (session.picking !== 'second') {
      setServingIdx(0)
      setCount(1)
    }
    worthSession.deliver(f)
  }
}

function side(food: Food, n: Nutrients, budget: DayBudget): Side {
  return {
    food,
    n,
    fit: worthIt(n, budget),
    health: healthScore(n).score,
    insight: analyseFood(food, n),
    ratings: sourceRatings(food, n),
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

function healthWord(score: number): string {
  return score >= 8.5 ? 'Excellent' : score >= 7 ? 'Good' : score >= 4.5 ? 'Average' : 'Poor'
}

/** A numbered badge so the two foods keep their place down the page. */
function Tag({ n }: { n: 1 | 2 }) {
  return <span className={`wtag wtag--${n}`}>{n}</span>
}

/** One food, top to bottom: name, the big score, the four ratings, the figures. */
function Detail({ side, tag, serving }: { side: Side; tag?: ReactNode; serving?: ReactNode }) {
  const { food, n, fit, health, insight, ratings } = side
  return (
    <>
      <div className="hero">
        <div className="hero__name">
          {tag}
          <span style={{ minWidth: 0 }}>
            <div className="hero__title">{food.name}</div>
            {food.brand && <div className="hero__brand">{food.brand}</div>}
          </span>
        </div>
        <div className="hero__scores">
          <div className="hero__main">
            <ScoreDial value={health} color={scoreColor(health)} size={138} stroke={11} fontSize={34} />
            <div className="hero__word" style={{ color: scoreColor(health) }}>
              {healthWord(health)}
            </div>
            <div className="hero__caption">Health score</div>
          </div>
          <div className="hero__side">
            <ScoreDial value={fit.score} color={scoreColor(fit.score)} size={74} stroke={7} fontSize={19} />
            <div className="hero__caption">Fits your plan</div>
            <div className="hero__note">{fit.notes[0]}</div>
          </div>
        </div>
      </div>

      {serving}

      <div className="section-label">As a source of</div>
      <div className="card">
        <RatingRow label="Protein" color="var(--protein)" r={ratings.protein} />
        <RatingRow label="Carbs" color="var(--carbs)" r={ratings.carbs} />
        <RatingRow label="Fat" color="var(--fat)" r={ratings.fat} />
        <RatingRow label="Clean eating" color="var(--positive)" r={ratings.clean} />
      </div>

      <div className="section-label">The figures</div>
      <Facts n={n} insight={insight} />

      <InsightList title="In its favour" items={insight.good} />
      <InsightList title="Worth knowing" items={insight.watch} />
    </>
  )
}

function ServingPicker({
  food,
  count,
  setCount,
  servingIdx,
  setServingIdx,
}: {
  food: Food
  count: number
  setCount(f: (c: number) => number): void
  servingIdx: number
  setServingIdx(i: number): void
}) {
  return (
    <div className="card">
      <div className="servings">
        <button className="servings__btn" onClick={() => setCount((c) => Math.max(0.5, c - 0.5))} aria-label="Fewer">
          <Icon name="minus" size={18} />
        </button>
        <span className="num" style={{ fontWeight: 700, minWidth: 46, textAlign: 'center' }}>
          {count}
        </span>
        <button className="servings__btn" onClick={() => setCount((c) => c + 0.5)} aria-label="More">
          <Icon name="plus" size={18} />
        </button>
        {food.servings.length > 1 ? (
          <select className="select" value={servingIdx} onChange={(e) => setServingIdx(Number(e.target.value))}>
            {food.servings.map((s, i) => (
              <option key={`${s.label}-${i}`} value={i}>
                {s.label}
              </option>
            ))}
          </select>
        ) : (
          <span style={{ fontSize: 14, color: 'var(--text-2)' }}>{food.servings[0]?.label}</span>
        )}
      </div>
    </div>
  )
}

/** A score chip, a word, and the figures behind it, with a bar in the nutrient's colour. */
function RatingRow({ label, color, r }: { label: string; color: string; r: Rating }) {
  return (
    <div className="rating">
      <span className="rating__chip" style={{ background: scoreColor(r.score) }}>
        {r.score.toFixed(1)}
      </span>
      <span className="rating__main">
        <span className="rating__head">
          <span className="rating__label">{label}</span>
          <span className="rating__word" style={{ color: scoreColor(r.score) }}>
            {r.label}
          </span>
        </span>
        <span className="rating__bar">
          <span style={{ width: `${r.score * 10}%`, background: color }} />
        </span>
        <span className="rating__detail">{r.detail}</span>
      </span>
    </div>
  )
}

/**
 * The reading itself, one figure a row. Where the food's make-up is known, it
 * sits beside the gram count rather than in a section of its own.
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

/**
 * Two foods side by side: who they are, their two scores face to face, and
 * every rating and figure in a row with the better one lit.
 */
function Compare({ a, b }: { a: Side; b: Side }) {
  /* The fourth value is which side leads: positive for the left, negative for
     the right. Calories, sugar and sodium are inverted, since less of each is
     the better showing. */
  const rows: [string, string, string, number][] = [
    ['Health score', a.health.toFixed(1), b.health.toFixed(1), a.health - b.health],
    ['Fits your plan', a.fit.score.toFixed(1), b.fit.score.toFixed(1), a.fit.score - b.fit.score],
    ['Protein source', a.ratings.protein.score.toFixed(1), b.ratings.protein.score.toFixed(1), a.ratings.protein.score - b.ratings.protein.score],
    ['Carb source', a.ratings.carbs.score.toFixed(1), b.ratings.carbs.score.toFixed(1), a.ratings.carbs.score - b.ratings.carbs.score],
    ['Fat source', a.ratings.fat.score.toFixed(1), b.ratings.fat.score.toFixed(1), a.ratings.fat.score - b.ratings.fat.score],
    ['Clean eating', a.ratings.clean.score.toFixed(1), b.ratings.clean.score.toFixed(1), a.ratings.clean.score - b.ratings.clean.score],
    ['Calories', cal(a.n.calories), cal(b.n.calories), b.n.calories - a.n.calories],
    ['Protein', `${Math.round(a.n.protein)} g`, `${Math.round(b.n.protein)} g`, a.n.protein - b.n.protein],
    ['Carbs', `${Math.round(a.n.carbs)} g`, `${Math.round(b.n.carbs)} g`, 0],
    ['Fat', `${Math.round(a.n.fat)} g`, `${Math.round(b.n.fat)} g`, 0],
    ['Fiber', `${Math.round(a.n.fiber)} g`, `${Math.round(b.n.fiber)} g`, a.n.fiber - b.n.fiber],
    ['Sugar', `${Math.round(a.n.sugar)} g`, `${Math.round(b.n.sugar)} g`, b.n.sugar - a.n.sugar],
    ['Sodium', `${Math.round(a.n.sodium)} mg`, `${Math.round(b.n.sodium)} mg`, b.n.sodium - a.n.sodium],
  ]

  const healthGap = a.health - b.health
  const fitGap = a.fit.score - b.fit.score
  /* A call is made whenever the numbers differ at all. Only an exact tie
     is left as one. */
  const verdict = (gap: number) => (gap === 0 ? 'Dead even' : gap > 0 ? a.food.name : b.food.name)

  return (
    <>
      <div className="vs">
        <div className="vs__sides">
          <div className="vs__side">
            <Tag n={1} />
            <div className="vs__name">{a.food.name}</div>
            {a.food.brand && <div className="vs__brand">{a.food.brand}</div>}
            <ScoreDial value={a.health} color={scoreColor(a.health)} size={92} stroke={9} fontSize={24} />
            <div className="hero__word" style={{ color: scoreColor(a.health), fontSize: 14 }}>
              {healthWord(a.health)}
            </div>
          </div>
          <div className="vs__mid">vs</div>
          <div className="vs__side">
            <Tag n={2} />
            <div className="vs__name">{b.food.name}</div>
            {b.food.brand && <div className="vs__brand">{b.food.brand}</div>}
            <ScoreDial value={b.health} color={scoreColor(b.health)} size={92} stroke={9} fontSize={24} />
            <div className="hero__word" style={{ color: scoreColor(b.health), fontSize: 14 }}>
              {healthWord(b.health)}
            </div>
          </div>
        </div>
        <div className="vs__verdicts">
          <div>
            <span className="vs__k">Healthier</span>
            <span className="vs__v">{verdict(healthGap)}</span>
          </div>
          <div>
            <span className="vs__k">Better for today</span>
            <span className="vs__v">{verdict(fitGap)}</span>
          </div>
        </div>
      </div>

      <div className="cmp cmp--head">
        <span />
        <span className="cmp__name">
          <Tag n={1} /> {a.food.name}
        </span>
        <span className="cmp__name">
          <Tag n={2} /> {b.food.name}
        </span>
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

function ScoreDial({
  value,
  color,
  size,
  stroke,
  fontSize,
}: {
  value: number
  color: string
  size: number
  stroke: number
  fontSize: number
}) {
  const r = 38 - stroke / 2
  const c = 2 * Math.PI * r
  const filled = Math.min(1, Math.max(0, value / 10))
  return (
    <svg width={size} height={size} viewBox="0 0 76 76" role="img" aria-label={`${value} out of 10`}>
      <circle cx="38" cy="38" r={r} fill="none" stroke="var(--surface-3)" strokeWidth={stroke} />
      {filled > 0 && (
        <circle
          cx="38"
          cy="38"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${filled * c} ${c}`}
          transform="rotate(-90 38 38)"
        />
      )}
      <text
        x="38"
        y="39"
        textAnchor="middle"
        dominantBaseline="central"
        className="num"
        style={{ fontSize: (fontSize * 76) / size, fontWeight: 800, fill: color }}
      >
        {value.toFixed(1)}
      </text>
    </svg>
  )
}
