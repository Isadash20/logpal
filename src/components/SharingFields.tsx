import { SegmentedField } from './ui'
import { Icon } from './Icon'
import type { ShareLevel } from '../types'

/**
 * The two questions behind "who sees my progress": who, and how much.
 *
 * Asked at sign-up, again the first time an older account follows someone,
 * and editable any time under Settings. The same control in all three places
 * so the answer means the same thing wherever it was given.
 */

/**
 * Three settings, in the order they give away more.
 *
 * `private` publishes to accepted friends only: a stranger sees nothing but
 * the username. `percent` lets anyone see how the day is going, as
 * percentages of goals, which hands over no figures. `exact` lets anyone see
 * the numbers themselves. The default is private; the other two are opt-in.
 */
export type Audience = 'private' | 'percent' | 'exact'

export const AUDIENCE_OPTIONS: { value: Audience; label: string; sub: string }[] = [
  { value: 'private', label: 'Private', sub: 'Only friends you accept see your progress. Everyone else sees your username and nothing more.' },
  { value: 'percent', label: 'Public, percentages', sub: 'Anyone can see how far through your goals you are, like 50% of calories. Never the numbers.' },
  { value: 'exact', label: 'Public, everything', sub: 'Anyone can see the figures themselves, like 1,000 / 2,000 cal.' },
]

/** The three rungs, for anything with a goal behind it. */
export const FIGURE_LEVELS: { value: ShareLevel; label: string }[] = [
  { value: 'off', label: 'Off' },
  { value: 'percent', label: '% of goal' },
  { value: 'exact', label: 'Exact' },
]

/** Workouts have no percentage, so the middle rung is the names alone. */
export const WORKOUT_LEVELS: { value: ShareLevel; label: string }[] = [
  { value: 'off', label: 'Off' },
  { value: 'percent', label: 'Exercises' },
  { value: 'exact', label: '+ calories' },
]

export interface ShareLevels {
  calories: ShareLevel
  water: ShareLevel
  steps: ShareLevel
  macros: ShareLevel
  workouts: ShareLevel
}

export const DEFAULT_LEVELS: ShareLevels = { calories: 'percent', water: 'percent', steps: 'percent', macros: 'percent', workouts: 'off' }

export function AudienceField({ value, onChange }: { value: Audience; onChange(v: Audience): void }) {
  return (
    <div role="radiogroup" aria-label="Who can see your progress">
      {AUDIENCE_OPTIONS.map((o) => {
        const on = o.value === value
        return (
          <button key={o.value} type="button" role="radio" aria-checked={on} className="row" onClick={() => onChange(o.value)}>
            <span className="row__main">
              <span className="row__title" style={{ display: 'block' }}>
                {o.label}
              </span>
              <span className="row__sub" style={{ display: 'block', whiteSpace: 'normal' }}>
                {o.sub}
              </span>
            </span>
            <span
              aria-hidden
              style={{
                width: 22,
                height: 22,
                borderRadius: 999,
                flex: 'none',
                border: `2px solid ${on ? 'var(--accent)' : 'var(--border-strong)'}`,
                background: on ? 'var(--accent)' : 'transparent',
                display: 'grid',
                placeContent: 'center',
              }}
            >
              {on && <Icon name="check" size={14} strokeWidth={3} />}
            </span>
          </button>
        )
      })}
    </div>
  )
}

/** Whether the server row is flagged private for this choice. */
export const isPrivateAudience = (a: Audience) => a === 'private'

/**
 * The per-figure levels a choice implies. Private keeps whatever the person
 * had (friends see that), percentages caps every figure at a percentage, and
 * everything opens them all.
 */
export function levelsForAudience(a: Audience, current: ShareLevels): ShareLevels {
  if (a === 'private') return current
  if (a === 'exact') return { calories: 'exact', water: 'exact', steps: 'exact', macros: 'exact', workouts: 'exact' }
  const cap = (l: ShareLevel): ShareLevel => (l === 'exact' ? 'percent' : l)
  return { calories: cap(current.calories), water: cap(current.water), steps: cap(current.steps), macros: cap(current.macros), workouts: cap(current.workouts) }
}

/** Reads the choice back from the stored state, for the settings screen. */
export function audienceOf(priv: boolean, levels: ShareLevels): Audience {
  if (priv) return 'private'
  const vals = [levels.calories, levels.water, levels.steps, levels.macros, levels.workouts]
  return vals.some((l) => l === 'exact') ? 'exact' : 'percent'
}

export function LevelFields({ value, onChange }: { value: ShareLevels; onChange(v: ShareLevels): void }) {
  const set = (k: keyof ShareLevels) => (v: ShareLevel) => onChange({ ...value, [k]: v })
  return (
    <>
      <SegmentedField<ShareLevel>
        label="Calories"
        sub="“% of goal” says how far through your target you are. “Exact” shows the numbers, like 1,000 / 2,000 cal."
        value={value.calories}
        options={FIGURE_LEVELS}
        onChange={set('calories')}
      />
      <SegmentedField<ShareLevel> label="Water" value={value.water} options={FIGURE_LEVELS} onChange={set('water')} />
      <SegmentedField<ShareLevel> label="Steps" value={value.steps} options={FIGURE_LEVELS} onChange={set('steps')} />
      <SegmentedField<ShareLevel> label="Macros" value={value.macros} options={FIGURE_LEVELS} onChange={set('macros')} />
      <SegmentedField<ShareLevel>
        label="Workouts"
        sub="No percentage here: the middle is the exercises alone and the last adds what they burned."
        value={value.workouts}
        options={WORKOUT_LEVELS}
        onChange={set('workouts')}
      />
    </>
  )
}

export function levelsToSettings(l: ShareLevels) {
  return { shareCalories: l.calories, shareWater: l.water, shareSteps: l.steps, shareMacros: l.macros, shareWorkouts: l.workouts }
}
