import { addDays, fromKey, shortDate } from './dates'

/**
 * The week, read back.
 *
 * Phillip (2026-11-06) showed MyFitnessPal's Weekly Digest and asked for one
 * that fits LogPal and beats it. Theirs is a page of totals, most of them
 * zero, with the same four cards for everyone. This one is a reading: one
 * score on the same dial NutriScan uses, a sentence that says what the week
 * was, seven days you can see at a glance, the foods that carried the week
 * and the ones that dragged it, and one thing to do differently next week.
 * Everything here is pure so it can be tested with made-up weeks.
 */
export interface DayInput {
  date: string
  calories: number
  protein: number
  carbs: number
  fat: number
  goal: number
  proteinTarget: number
  carbsTarget: number
  fatTarget: number
  waterMl: number
  waterGoal: number
  steps: number | null
  stepGoal: number
  sleepMin: number | null
  sleepGoal: number
  exerciseMinutes: number
  exerciseCalories: number
}

export interface FoodTally {
  name: string
  count: number
  /** Health score 1-10, averaged over the entries. */
  score: number
  calories: number
}

export interface LiftPr {
  exercise: string
  weightLb: number
  date: string
}

export interface WeekInput {
  /** Monday. */
  start: string
  today: string
  days: DayInput[]
  /** The week before, for the comparison strip; null when there is nothing in it. */
  prev: DayInput[] | null
  foods: FoodTally[]
  /** Last weigh-in before the week, and the last one inside it. */
  weightBefore: number | null
  weightEnd: number | null
  lifts: LiftPr[]
}

export type DayStatus = 'in' | 'under' | 'over' | 'none'

export interface ReviewDay {
  date: string
  letter: string
  status: DayStatus
  calories: number
  goal: number
  future: boolean
}

export interface WeekReview {
  start: string
  end: string
  label: string
  partial: boolean
  elapsed: number
  score: number
  word: string
  headline: string
  days: ReviewDay[]
  logged: number
  calorieDays: number
  avgCalories: number
  avgGoal: number
  bestDay: string | null
  macros: { key: 'protein' | 'carbs' | 'fat'; label: string; avg: number; target: number }[]
  stars: FoodTally[]
  swaps: FoodTally[]
  body: {
    weightBefore: number | null
    weightEnd: number | null
    waterDays: number
    stepTotal: number
    stepDays: number
    bestStepDay: { date: string; steps: number } | null
    sleepAvg: number | null
    sleepDays: number
    exerciseMinutes: number
    exerciseCalories: number
  }
  lifts: LiftPr[]
  focus: { title: string; text: string }
  vsLast: { label: string; delta: number; unit: string; goodWhen: 'up' | 'down' }[] | null
}

const LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

/** The Monday on or before the day. */
export function weekStart(key: string): string {
  const wd = (fromKey(key).getDay() + 6) % 7
  return addDays(key, -wd)
}

export function weekLabel(start: string): string {
  return `${shortDate(start)} – ${shortDate(addDays(start, 6))}`
}

export function dayStatus(d: DayInput): DayStatus {
  if (d.calories <= 0) return 'none'
  if (d.goal <= 0) return 'in'
  if (d.calories > d.goal * 1.05) return 'over'
  if (d.calories < d.goal * 0.5) return 'under'
  return 'in'
}

function weekday(key: string): string {
  return fromKey(key).toLocaleDateString(undefined, { weekday: 'long' })
}

interface Parts {
  logged: number
  calorieDays: number
  proteinDays: number
  waterDays: number
  stepDays: number
  stepsSeen: boolean
  sleepDays: number
  sleepSeen: boolean
}

function parts(days: DayInput[]): Parts {
  const p: Parts = { logged: 0, calorieDays: 0, proteinDays: 0, waterDays: 0, stepDays: 0, stepsSeen: false, sleepDays: 0, sleepSeen: false }
  for (const d of days) {
    const st = dayStatus(d)
    if (st !== 'none') p.logged++
    if (st === 'in') p.calorieDays++
    if (st !== 'none' && d.proteinTarget > 0 && d.protein >= d.proteinTarget * 0.9) p.proteinDays++
    if (d.waterGoal > 0 && d.waterMl >= d.waterGoal) p.waterDays++
    if (d.steps !== null) {
      p.stepsSeen = true
      if (d.stepGoal > 0 && d.steps >= d.stepGoal) p.stepDays++
    }
    if (d.sleepMin !== null) {
      p.sleepSeen = true
      if (d.sleepGoal > 0 && d.sleepMin >= d.sleepGoal * 0.9) p.sleepDays++
    }
  }
  return p
}

/**
 * 0-10. Logging carries the most weight because everything else is read
 * from it; steps and sleep count only for someone who records them, so a
 * person without a pedometer is not marked down for owning none.
 */
export function weekScore(days: DayInput[], elapsed: number): { score: number; weakest: keyof typeof WEIGHTS | null } {
  const p = parts(days)
  const n = Math.max(1, elapsed)
  const ratios: Partial<Record<keyof typeof WEIGHTS, number>> = {
    logged: p.logged / n,
    calories: p.logged ? p.calorieDays / p.logged : 0,
    protein: p.logged ? p.proteinDays / p.logged : 0,
    water: p.waterDays / n,
  }
  if (p.stepsSeen) ratios.steps = p.stepDays / n
  if (p.sleepSeen) ratios.sleep = p.sleepDays / n
  let wsum = 0
  let total = 0
  let weakest: keyof typeof WEIGHTS | null = null
  let worst = 2
  for (const k of Object.keys(ratios) as (keyof typeof WEIGHTS)[]) {
    const w = WEIGHTS[k]
    const r = Math.min(1, ratios[k]!)
    wsum += w
    total += w * r
    if (r < worst) {
      worst = r
      weakest = k
    }
  }
  const score = wsum ? Math.round((total / wsum) * 100) / 10 : 0
  /* Under half the days logged, nothing else is worth advising on yet. */
  if (ratios.logged! < 0.5 && p.logged < n) weakest = 'logged'
  return { score, weakest: worst >= 0.85 ? null : weakest }
}

const WEIGHTS = { logged: 0.3, calories: 0.25, protein: 0.15, water: 0.1, steps: 0.1, sleep: 0.1 } as const

export function weekWord(score: number, partial: boolean): string {
  const w = score >= 8.5 ? 'Excellent' : score >= 7 ? 'Strong' : score >= 5.5 ? 'Steady' : score >= 4 ? 'Uneven' : 'Rough'
  return partial ? `${w} so far` : `${w} week`
}

export function weekReview(input: WeekInput): WeekReview {
  const { start, today } = input
  const end = addDays(start, 6)
  const days = input.days.slice(0, 7)
  const partial = today < end
  const elapsed = Math.max(1, Math.min(7, days.filter((d) => d.date <= today).length))
  const live = days.filter((d) => d.date <= today)
  const p = parts(live)
  const { score, weakest } = weekScore(live, elapsed)

  const loggedDays = live.filter((d) => dayStatus(d) !== 'none')
  const avg = (f: (d: DayInput) => number) =>
    loggedDays.length ? Math.round(loggedDays.reduce((s, d) => s + f(d), 0) / loggedDays.length) : 0
  const avgCalories = avg((d) => d.calories)
  const avgGoal = avg((d) => d.goal)

  /* Best day: logged, inside the goal, closest to it from below; failing
     that, the day closest to the goal at all. */
  const inDays = loggedDays.filter((d) => dayStatus(d) === 'in')
  const pool = inDays.length ? inDays : loggedDays
  const bestDay = pool.length
    ? pool.reduce((b, d) => (Math.abs(d.goal - d.calories) < Math.abs(b.goal - b.calories) ? d : b)).date
    : null

  const foods = [...input.foods].sort((a, b) => b.count - a.count || b.score - a.score)
  const regular = foods.filter((f) => f.count >= 2)
  const starsPool = (regular.length >= 3 ? regular : foods).filter((f) => f.score >= 7)
  const swapsPool = (regular.length >= 3 ? regular : foods).filter((f) => f.score <= 4)
  const stars = starsPool.slice(0, 3)
  const swaps = swapsPool.slice(0, 2)

  const stepsDays = live.filter((d) => d.steps !== null)
  const bestStep = stepsDays.length
    ? stepsDays.reduce((b, d) => (d.steps! > b.steps! ? d : b))
    : null
  const sleepDaysSeen = live.filter((d) => d.sleepMin !== null)

  const body: WeekReview['body'] = {
    weightBefore: input.weightBefore,
    weightEnd: input.weightEnd,
    waterDays: p.waterDays,
    stepTotal: stepsDays.reduce((s, d) => s + (d.steps ?? 0), 0),
    stepDays: p.stepDays,
    bestStepDay: bestStep && bestStep.steps ? { date: bestStep.date, steps: bestStep.steps } : null,
    sleepAvg: sleepDaysSeen.length
      ? Math.round(sleepDaysSeen.reduce((s, d) => s + (d.sleepMin ?? 0), 0) / sleepDaysSeen.length)
      : null,
    sleepDays: p.sleepDays,
    exerciseMinutes: live.reduce((s, d) => s + d.exerciseMinutes, 0),
    exerciseCalories: live.reduce((s, d) => s + d.exerciseCalories, 0),
  }

  /* The headline: two things that went right, one that did not, in a
     sentence. Zeroes are left out rather than announced. */
  const clauses: string[] = []
  clauses.push(`${p.logged} of ${elapsed} day${elapsed === 1 ? '' : 's'} logged`)
  if (p.logged) clauses.push(`inside the calorie goal on ${p.calorieDays}`)
  if (p.waterDays) clauses.push(`water goal hit ${p.waterDays} time${p.waterDays === 1 ? '' : 's'}`)
  if (p.stepsSeen && p.stepDays) clauses.push(`steps there on ${p.stepDays}`)
  const headline =
    p.logged === 0
      ? partial
        ? 'Nothing in the diary yet this week. The first entry starts the score.'
        : 'Nothing was logged this week, so there is nothing to read back yet.'
      : clauses.length > 1
        ? `${clauses.slice(0, -1).join(', ')}, and ${clauses[clauses.length - 1]}.`
        : `${clauses[0]}.`

  /* Next week's one thing: the weakest part of the score, in words. */
  const over = loggedDays.filter((d) => dayStatus(d) === 'over')
  const avgOver = over.length ? Math.round(over.reduce((s, d) => s + d.calories - d.goal, 0) / over.length) : 0
  const under = loggedDays.filter((d) => dayStatus(d) === 'under')
  const missed = elapsed - p.logged
  const proteinUnder = loggedDays.length - p.proteinDays
  let focus: { title: string; text: string }
  if (p.logged === 0) {
    focus = { title: 'Start with one meal', text: 'Log one meal a day next week, whichever is easiest. The rest of this page fills in from there.' }
  } else if (!weakest) {
    focus = { title: 'Keep this going', text: 'Nothing to fix. Same again next week, and the streak takes care of itself.' }
  } else if (weakest === 'logged') {
    focus = {
      title: 'Log every day',
      text: `${missed} day${missed === 1 ? '' : 's'} had nothing in the diary. A rough day logged is worth more than a good day missing: the score, the ideas and the race all read from it.`,
    }
  } else if (weakest === 'calories') {
    focus =
      over.length >= under.length
        ? {
            title: 'Land the calories',
            text: `Over the goal on ${over.length} day${over.length === 1 ? '' : 's'}, by about ${avgOver} calories each. One swap at the biggest meal usually covers that.`,
          }
        : {
            title: 'Eat enough to count',
            text: `${under.length} logged day${under.length === 1 ? '' : 's'} came in under half the goal, which usually means the diary stopped early rather than the eating did.`,
          }
  } else if (weakest === 'protein') {
    focus = {
      title: 'Lead with protein',
      text: `Protein came in under target on ${proteinUnder} of ${loggedDays.length} logged day${loggedDays.length === 1 ? '' : 's'}. The ideas on Home lean protein-heavy while that is true.`,
    }
  } else if (weakest === 'water') {
    focus = {
      title: 'Drink the water',
      text: `${p.waterDays} of ${elapsed} day${elapsed === 1 ? '' : 's'} hit the water goal. A bottle in reach does most of the work.`,
    }
  } else if (weakest === 'steps') {
    focus = {
      title: 'Walk a little more',
      text: body.bestStepDay
        ? `Steps reached the goal on ${p.stepDays} day${p.stepDays === 1 ? '' : 's'}. The best was ${weekday(body.bestStepDay.date)} at ${body.bestStepDay.steps.toLocaleString()}; one more of those would do it.`
        : `Steps reached the goal on ${p.stepDays} day${p.stepDays === 1 ? '' : 's'}.`,
    }
  } else {
    const h = Math.floor((body.sleepAvg ?? 0) / 60)
    const m = (body.sleepAvg ?? 0) % 60
    focus = {
      title: 'Protect the sleep',
      text: `Averaged ${h}h ${m}m a night against the goal. Hunger and willpower both run on it.`,
    }
  }

  /* Against last week, same days of the week. */
  let vsLast: WeekReview['vsLast'] = null
  if (input.prev) {
    const prevLive = input.prev.slice(0, elapsed)
    const pp = parts(prevLive)
    const prevLogged = prevLive.filter((d) => dayStatus(d) !== 'none')
    const prevAvg = prevLogged.length ? Math.round(prevLogged.reduce((s, d) => s + d.calories, 0) / prevLogged.length) : 0
    const prevSteps = prevLive.reduce((s, d) => s + (d.steps ?? 0), 0)
    const { score: prevScore } = weekScore(prevLive, elapsed)
    vsLast = [
      { label: 'Score', delta: Math.round((score - prevScore) * 10) / 10, unit: '', goodWhen: 'up' },
      { label: 'Days logged', delta: p.logged - pp.logged, unit: '', goodWhen: 'up' },
      { label: 'Avg calories', delta: avgCalories - prevAvg, unit: ' cal', goodWhen: 'down' },
      { label: 'Water days', delta: p.waterDays - pp.waterDays, unit: '', goodWhen: 'up' },
      ...(body.stepTotal || prevSteps ? [{ label: 'Steps', delta: body.stepTotal - prevSteps, unit: '', goodWhen: 'up' as const }] : []),
    ]
  }

  return {
    start,
    end,
    label: weekLabel(start),
    partial,
    elapsed,
    score,
    word: weekWord(score, partial),
    headline,
    days: days.map((d, i) => ({
      date: d.date,
      letter: LETTERS[i],
      status: d.date > today ? 'none' : dayStatus(d),
      calories: d.calories,
      goal: d.goal,
      future: d.date > today,
    })),
    logged: p.logged,
    calorieDays: p.calorieDays,
    avgCalories,
    avgGoal,
    bestDay,
    macros: [
      { key: 'protein', label: 'Protein', avg: avg((d) => d.protein), target: avg((d) => d.proteinTarget) },
      { key: 'carbs', label: 'Carbs', avg: avg((d) => d.carbs), target: avg((d) => d.carbsTarget) },
      { key: 'fat', label: 'Fat', avg: avg((d) => d.fat), target: avg((d) => d.fatTarget) },
    ],
    stars,
    swaps,
    body,
    lifts: input.lifts,
    focus,
    vsLast,
  }
}
