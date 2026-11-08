import { SegmentedField } from './ui'
import type { ShareLevel } from '../types'

/**
 * The two questions behind "who sees my progress": who, and how much.
 *
 * Asked at sign-up, again the first time an older account follows someone,
 * and editable any time under Settings. The same control in all three places
 * so the answer means the same thing wherever it was given.
 */

export type Audience = 'public' | 'friends'

export const AUDIENCE_OPTIONS: { value: Audience; label: string }[] = [
  { value: 'friends', label: 'Friends only' },
  { value: 'public', label: 'Public' },
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
    <SegmentedField<Audience>
      label="Who can see your progress"
      sub={
        value === 'friends'
          ? 'People have to ask to follow you, and only the ones you accept see anything.'
          : 'Anyone who finds you sees what you share below, without asking.'
      }
      value={value}
      options={AUDIENCE_OPTIONS}
      onChange={onChange}
    />
  )
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
