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
import { analyseFood, type FoodInsight } from '../lib/foodInsight'
import { sourceRatings, type Rating, type SourceRatings } from '../lib/sourceRatings'
import { searchLocal } from '../services/foodSearch'
import { loadFoodDb, onFoodDbGrown } from '../services/foodDb'
import { lookupBarcode, searchProducts } from '../services/openFoodFacts'

/**
 * NutriScan: what one food is, and how two foods compare.
 *
 * The page is deliberately spare. The health score sits alone on the wash,
 * big and in colour, because it is the reason the screen was opened. Under
 * it, four small tiles say what kind of food it is: a protein source, a carb
 * source, a fat source, and how clean it is. Then the figures in one strip,
 * then a short list of notes. No cards stacked on cards, no prose beside
 * every number. Nothing here logs anything; the diary has its own doors.
 * The one action is to put a second food beside the first.
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
  /* Three ways in, asked before anything else. A search box on arrival makes
     the screen look like the food search it is not, and hides the scanners,
     which are the faster route when the thing is in your hand. */
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
            <div className="ns-lead">
              {session.picking === 'second' && food
                ? `Pick a second food to set beside ${food.name}.`
                : 'Scan or search a food to see how it rates.'}
            </div>
            <div className="ns-panel">
              <Way icon="barcode" label="Scan a barcode" onClick={() => push({ name: 'scan', date, mode: 'worth' })} />
              <Way icon="nutriscan" label="Scan a label" onClick={() => push({ name: 'nutriScan', date, mode: 'worth' })} />
              <Way icon="search" label="Search by name" onClick={() => setStage('search')} />
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

  const picker = first && (
    <ServingPicker
      caption={second ? `Serving of ${first.food.name}` : undefined}
      food={first.food}
      count={count}
      setCount={setCount}
      servingIdx={servingIdx}
      setServingIdx={setServingIdx}
    />
  )

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
            <Compare a={first} b={second} serving={picker} />
            <div className="ns-clear">
              <button className="textbtn" style={{ padding: 0 }} onClick={() => worthSession.clearSecond()}>
                Clear comparison
              </button>
            </div>
          </>
        ) : (
          first && <Detail side={first} serving={picker} />
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

/** One way in: a small tinted icon, a label, a chevron. */
function Way({ icon, label, onClick }: { icon: 'barcode' | 'nutriscan' | 'search'; label: string; onClick(): void }) {
  return (
    <Row
      className="ns-way"
      left={
        <span className="ns-way__icon">
          <Icon name={icon} size={20} />
        </span>
      }
      title={label}
      chevron
      onClick={onClick}
    />
  )
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

/** One food, top to bottom: name, the big score, four tiles, the figures, notes. */
function Detail({ side, serving }: { side: Side; serving?: ReactNode }) {
  const { food, n, fit, health, insight, ratings } = side
  return (
    <>
      <div className="ns-hero">
        <div className="ns-name">{food.name}</div>
        {food.brand && <div className="ns-brand">{food.brand}</div>}
        <div className="ns-dial">
          <ScoreDial value={health} color={scoreColor(health)} size={156} stroke={3.5} fontSize={44} />
        </div>
        <div className="ns-word" style={{ color: scoreColor(health) }}>
          {healthWord(health)}
        </div>
        <div className="ns-fit">
          <span className="ns-fit__dot" style={{ background: scoreColor(fit.score) }} />
          Fits your plan
          <b className="num">{fit.score.toFixed(1)}</b>
        </div>
      </div>

      {serving}

      <div className="ns-h">As a source of</div>
      <div className="ns-grid">
        <Tile label="Protein" color="var(--protein)" r={ratings.protein} neutralLow />
        <Tile label="Carbs" color="var(--carbs)" r={ratings.carbs} neutralLow />
        <Tile label="Fat" color="var(--fat)" r={ratings.fat} neutralLow />
        <Tile label="Clean eating" color="var(--positive)" r={ratings.clean} />
      </div>

      <div className="ns-h">Per serving</div>
      <Facts n={n} />

      <Notes insight={insight} />
    </>
  )
}

function ServingPicker({
  caption,
  food,
  count,
  setCount,
  servingIdx,
  setServingIdx,
}: {
  /* Named when two foods are on the page, since only the first one scales. */
  caption?: string
  food: Food
  count: number
  setCount(f: (c: number) => number): void
  servingIdx: number
  setServingIdx(i: number): void
}) {
  return (
    <div className="ns-serving">
      {caption && <span className="ns-serving__cap">{caption}</span>}
      <button className="servings__btn" onClick={() => setCount((c) => Math.max(0.5, c - 0.5))} aria-label="Fewer">
        <Icon name="minus" size={16} />
      </button>
      <span className="ns-serving__count num">{count}</span>
      <button className="servings__btn" onClick={() => setCount((c) => c + 0.5)} aria-label="More">
        <Icon name="plus" size={16} />
      </button>
      {food.servings.length > 1 ? (
        <select className="select ns-serving__unit" value={servingIdx} onChange={(e) => setServingIdx(Number(e.target.value))}>
          {food.servings.map((s, i) => (
            <option key={`${s.label}-${i}`} value={i}>
              {s.label}
            </option>
          ))}
        </select>
      ) : (
        <span className="ns-serving__unit">{food.servings[0]?.label}</span>
      )}
    </div>
  )
}

/** A rating as one small tile: what it is, the score in colour, a word, a hairline bar.
    A food that is simply not a source of something is grey, not red: that is
    a fact about it, not a mark against it. Clean eating has no such excuse. */
function Tile({ label, color, r, neutralLow }: { label: string; color: string; r: Rating; neutralLow?: boolean }) {
  const tone = neutralLow && r.score < 2 ? 'var(--text-3)' : scoreColor(r.score)
  return (
    <div className="ns-tile">
      <span className="ns-tile__label">{label}</span>
      <span className="ns-tile__line">
        <span className="ns-tile__score num" style={{ color: tone }}>
          {r.score.toFixed(1)}
        </span>
        <span className="ns-tile__word">{r.label}</span>
      </span>
      <span className="ns-tile__bar">
        <span style={{ width: `${r.score * 10}%`, background: color }} />
      </span>
    </div>
  )
}

/** The four figures that matter in a strip, the three that matter less in a line. */
function Facts({ n }: { n: Nutrients }) {
  return (
    <div className="ns-panel ns-facts">
      <div className="ns-facts__main">
        <Fact v={cal(n.calories)} k="Calories" />
        <Fact v={`${Math.round(n.protein)} g`} k="Protein" />
        <Fact v={`${Math.round(n.carbs)} g`} k="Carbs" />
        <Fact v={`${Math.round(n.fat)} g`} k="Fat" />
      </div>
      <div className="ns-facts__more">
        <span>Fiber {Math.round(n.fiber)} g</span>
        <span>Sugar {Math.round(n.sugar)} g</span>
        <span>Sodium {Math.round(n.sodium)} mg</span>
      </div>
    </div>
  )
}

function Fact({ v, k }: { v: string; k: string }) {
  return (
    <div className="ns-fact">
      <span className="ns-fact__v num">{v}</span>
      <span className="ns-fact__k">{k}</span>
    </div>
  )
}

/** The good and the watch-outs in one short list, told apart by the dot. */
function Notes({ insight }: { insight: FoodInsight }) {
  const items = [...insight.good, ...insight.watch]
  if (!items.length) return null
  return (
    <>
      <div className="ns-h">Notes</div>
      <div className="ns-panel">
        {items.map((i) => (
          <div key={i.label} className="ns-note">
            <span className="ns-note__dot" style={{ background: i.tone === 'good' ? 'var(--positive)' : 'var(--warning)' }} />
            <span>
              <b>{i.label}</b>
              <span className="ns-note__detail"> {i.detail}</span>
            </span>
          </div>
        ))}
      </div>
    </>
  )
}

/**
 * Two foods face to face: their two scores, who wins on what, and every
 * rating and figure in a row with the better one lit.
 */
function Compare({ a, b, serving }: { a: Side; b: Side; serving?: ReactNode }) {
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
      <div className="ns-hero">
        <div className="ns-vs">
          <Face side={a} />
          <div className="ns-vs__mid">vs</div>
          <Face side={b} />
        </div>
        <div className="ns-verdicts">
          <div>
            <span className="ns-verdict__k">Healthier</span>
            <span className="ns-verdict__v">{verdict(healthGap)}</span>
          </div>
          <div>
            <span className="ns-verdict__k">Better for today</span>
            <span className="ns-verdict__v">{verdict(fitGap)}</span>
          </div>
        </div>
      </div>

      {serving}

      <div className="ns-panel">
        <div className="ns-cmp ns-cmp--head">
          <span />
          <span className="ns-cmp__name">{a.food.name}</span>
          <span className="ns-cmp__name">{b.food.name}</span>
        </div>
        {rows.map(([label, left, right, delta]) => (
          <div key={label} className="ns-cmp">
            <span className="ns-cmp__label">{label}</span>
            <span className={`ns-cmp__v num ${delta > 0 ? 'ns-cmp__v--lead' : ''}`}>{left}</span>
            <span className={`ns-cmp__v num ${delta < 0 ? 'ns-cmp__v--lead' : ''}`}>{right}</span>
          </div>
        ))}
      </div>
    </>
  )
}

function Face({ side }: { side: Side }) {
  const { food, health } = side
  return (
    <div className="ns-vs__side">
      <ScoreDial value={health} color={scoreColor(health)} size={92} stroke={3.5} fontSize={26} />
      <div className="ns-word ns-word--sm" style={{ color: scoreColor(health) }}>
        {healthWord(health)}
      </div>
      <div className="ns-vs__name">{food.name}</div>
      {food.brand && <div className="ns-brand">{food.brand}</div>}
    </div>
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
      <circle cx="38" cy="38" r={r} fill="none" stroke="var(--border-strong)" strokeWidth={stroke} opacity={0.6} />
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
        style={{ fontSize: (fontSize * 76) / size, fontWeight: 800, fill: color, letterSpacing: '-0.03em' }}
      >
        {value.toFixed(1)}
      </text>
    </svg>
  )
}
