import type { CrewDetail } from '../services/crews'
import type { Person } from '../services/social'

/** A filled crew for screenshots: `?crewdemo` on a dev server. Dead in production. */
export function demoCrew(me: string): CrewDetail {
  const person = (userId: string, username: string, name: string | null, over: Partial<Person> = {}): Person => ({
    userId,
    username,
    name,
    streak: 4,
    lastLogged: null,
    caloriePct: null,
    waterPct: null,
    stepPct: null,
    proteinPct: null,
    carbsPct: null,
    fatPct: null,
    calories: null,
    calorieGoal: null,
    waterMl: null,
    waterGoalMl: null,
    steps: null,
    stepGoal: null,
    proteinG: null,
    carbsG: null,
    fatG: null,
    exercise: null,
    exerciseCalories: null,
    weekStepDays: 3,
    weekWaterDays: 4,
    weekCalorieDays: 2,
    weekLoggedDays: 5,
    weekSteps: 41_200,
    private: false,
    empty: false,
    ...over,
  })
  const h = (hoursAgo: number) => new Date(Date.now() - hoursAgo * 3_600_000).toISOString()
  const d = (daysFromNow: number) => new Date(Date.now() + daysFromNow * 86_400_000).toISOString().slice(0, 10)
  return {
    crew: {
      id: 'demo',
      name: 'Morning Walkers',
      emoji: '🏃',
      photo: null,
      visibility: 'private',
      inviteCode: 'KQ7M3HTD',
      owner: me,
      createdAt: h(24 * 12),
    },
    members: [
      { person: person(me, 'phillip', 'Phillip', { streak: 9, weekLoggedDays: 7, weekStepDays: 5, weekSteps: 58_300 }), role: 'owner', joinedAt: h(24 * 12) },
      { person: person('u2', 'isa', 'Isabella', { streak: 12, weekWaterDays: 6, weekSteps: 44_900 }), role: 'member', joinedAt: h(24 * 11) },
      { person: person('u3', 'marco', 'Marco', { weekLoggedDays: 3, weekStepDays: 1, weekSteps: 12_000 }), role: 'member', joinedAt: h(24 * 6) },
      { person: person('u4', 'dani', null, { weekLoggedDays: null, weekStepDays: null, weekWaterDays: null, weekCalorieDays: null, weekSteps: null, streak: null }), role: 'member', joinedAt: h(30) },
    ],
    challenges: [
      { id: 'c1', crewId: 'demo', kind: 'steps', title: '7-Day Steps Challenge', starts: d(-3), ends: d(3), createdBy: me, createdAt: h(24 * 3), members: [me, 'u2', 'u3', 'u4'].map((userId) => ({ userId, status: 'in' as const, invitedBy: me })) },
      { id: 'c0', crewId: 'demo', kind: 'water', title: '14-Day Water Challenge', starts: d(-30), ends: d(-17), createdBy: 'u2', createdAt: h(24 * 30), members: [me, 'u2'].map((userId) => ({ userId, status: 'in' as const, invitedBy: 'u2' })) },
    ],
    posts: [
      { id: 'p1', userId: 'u2', kind: 'chat', body: 'Who is walking before work tomorrow? 6:45 at the park.', createdAt: h(26), kudos: { '👏': ['u3'] } },
      { id: 'p2', userId: me, kind: 'milestone', body: 'New Bench press PR: 150 lb × 5 🏋️', createdAt: h(20), kudos: { '🔥': ['u2', 'u3'], '💪': ['u4'] } },
      { id: 'p3', userId: 'u3', kind: 'chat', body: 'In. Bringing the dog.', createdAt: h(19), kudos: {} },
      { id: 'p4', userId: 'u2', kind: 'milestone', body: '14-day logging streak 🔥', createdAt: h(5), kudos: { '🎉': [me] } },
      { id: 'p5', userId: me, kind: 'chat', body: 'Three days left on steps. Marco, you are 2,000 behind me 👀', createdAt: h(1), kudos: {} },
    ],
    recipes: [
      { recipeId: 'overnight-oats', userId: 'u2', title: 'Overnight oats with berries', note: 'Five minutes the night before', createdAt: h(40) },
      { recipeId: 'chicken-stir-fry', userId: me, title: 'Chicken stir fry', note: null, createdAt: h(70) },
    ],
  }
}
