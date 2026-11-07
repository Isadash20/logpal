import type { ExerciseDef, ExerciseKind } from '../types'

/**
 * Exercise database, rebuilt 2026-11-07.
 *
 * One entry per activity, not per pace: "Walking", not "Walking, 3.5 mph,
 * brisk". The pace comes from the distance the person types, through the
 * speed curves in lib/exercise.ts; the MET here is the general intensity
 * used when they only give a time. Values are from the Compendium of
 * Physical Activities.
 *
 * Three tabs. Cardio and Sports overlap on purpose: mountain biking is a
 * sport and a workout, so it is filed under both. `kind` is the first tab,
 * `also` any other. Strength entries have no MET; they are logged for the
 * record.
 */

type Row = [name: string, met: number, opts?: { also?: ExerciseKind[]; curve?: string; climbs?: boolean }]

const CARDIO: Row[] = [
  ['Walking', 3.5, { curve: 'walking', climbs: true }],
  ['Indoor Walking', 3.5, { curve: 'walking', climbs: true }],
  ['Walking the Dog', 3.0, { curve: 'walking' }],
  ['Hiking', 6.0, { curve: 'hiking', climbs: true }],
  ['Rucking', 7.0, { curve: 'hiking', climbs: true }],
  ['Running', 9.8, { curve: 'running', climbs: true }],
  ['Indoor Running', 9.0, { curve: 'running', climbs: true }],
  ['Trail Running', 10.5, { curve: 'trailRunning', climbs: true }],
  ['Cycling', 8.0, { curve: 'cycling', climbs: true, also: ['sports'] }],
  ['Indoor Cycling', 6.8, { curve: 'cycling' }],
  ['Mountain Biking', 8.5, { curve: 'mountainBiking', climbs: true, also: ['sports'] }],
  ['Gravel Riding', 8.0, { curve: 'cycling', climbs: true, also: ['sports'] }],
  ['Spin Class', 8.5],
  ['Assault Bike', 9.0],
  ['Swimming', 6.0, { curve: 'swimming', also: ['sports'] }],
  ['Indoor Swimming', 6.0, { curve: 'swimming' }],
  ['Open Water Swimming', 7.0, { curve: 'swimming', also: ['sports'] }],
  ['Water Aerobics', 5.5],
  ['Aqua Jogging', 8.0],
  ['Elliptical', 5.5],
  ['Indoor Rowing', 7.0, { curve: 'paddling' }],
  ['Rowing, outdoor', 7.0, { curve: 'paddling', also: ['sports'] }],
  ['Ski Erg', 7.5],
  ['Stair Climber', 9.0],
  ['Stair Climbing', 8.0],
  ['Jump Rope', 11.8],
  ['HIIT', 8.0],
  ['Circuit Training', 7.2],
  ['Tabata', 9.0],
  ['Boot Camp', 7.8],
  ['CrossFit', 8.0],
  ['Kettlebell Workout', 8.0],
  ['Battle Ropes', 8.0],
  ['Sled Push', 8.5],
  ['Burpees', 8.0],
  ['Jumping Jacks', 8.0],
  ['Aerobics', 6.5],
  ['Step Aerobics', 7.5],
  ['Zumba', 6.5],
  ['Dancing', 4.8],
  ['Barre', 3.5],
  ['Yoga', 3.0],
  ['Power Yoga', 4.0],
  ['Hot Yoga', 4.0],
  ['Pilates', 3.0],
  ['Tai Chi', 3.0],
  ['Stretching', 2.3],
  ['Mobility Work', 2.5],
  ['Foam Rolling', 2.0],
  ['Boxing, bag work', 5.5],
  ['Kickboxing', 10.3, { also: ['sports'] }],
  ['Martial Arts', 10.3, { also: ['sports'] }],
  ['Rock Climbing', 8.0, { also: ['sports'], climbs: true }],
  ['Bouldering', 7.5, { also: ['sports'] }],
  ['Ice Skating', 7.0, { curve: 'skating', also: ['sports'] }],
  ['Inline Skating', 7.5, { curve: 'skating', also: ['sports'] }],
  ['Skateboarding', 5.0, { also: ['sports'] }],
  ['Cross-Country Skiing', 9.0, { curve: 'xcSkiing', climbs: true, also: ['sports'] }],
  ['Snowshoeing', 7.5, { curve: 'hiking', climbs: true }],
  ['Downhill Skiing', 6.8, { also: ['sports'] }],
  ['Snowboarding', 5.3, { also: ['sports'] }],
  ['Kayaking', 5.0, { curve: 'paddling', also: ['sports'] }],
  ['Canoeing', 4.0, { curve: 'paddling', also: ['sports'] }],
  ['Paddleboarding', 6.0, { curve: 'paddling', also: ['sports'] }],
  ['Surfing', 3.0, { also: ['sports'] }],
  ['Horseback Riding', 5.5, { also: ['sports'] }],
  ['Trampoline', 3.5],
  ['Hula Hoop', 4.0],
  ['Gardening', 3.8],
  ['Mowing the Lawn', 5.5],
  ['Shoveling Snow', 5.3],
  ['House Cleaning', 3.5],
  ['Moving Furniture', 5.8],
  ['Playing with Kids', 4.0],
]

const SPORTS: Row[] = [
  ['Football', 8.0],
  ['Flag Football', 7.0],
  ['Soccer', 7.0],
  ['Basketball', 8.0],
  ['Baseball', 5.0],
  ['Softball', 5.0],
  ['Volleyball', 4.0],
  ['Beach Volleyball', 8.0],
  ['Tennis', 7.3],
  ['Pickleball', 6.0],
  ['Padel', 6.5],
  ['Badminton', 5.5],
  ['Table Tennis', 4.0],
  ['Squash', 12.0],
  ['Racquetball', 7.0],
  ['Golf', 4.3, { curve: 'walking' }],
  ['Disc Golf', 4.0, { curve: 'walking' }],
  ['Ice Hockey', 8.0],
  ['Field Hockey', 7.8],
  ['Roller Hockey', 8.0],
  ['Lacrosse', 8.0],
  ['Rugby', 8.3],
  ['Water Polo', 10.0],
  ['Handball', 12.0],
  ['Ultimate Frisbee', 8.0],
  ['Cricket', 4.8],
  ['Dodgeball', 6.0],
  ['Kickball', 5.0],
  ['Spikeball', 6.0],
  ['Boxing, sparring', 7.8],
  ['Wrestling', 6.0],
  ['Judo', 10.3],
  ['Brazilian Jiu-Jitsu', 9.0],
  ['Taekwondo', 10.3],
  ['Karate', 10.3],
  ['MMA', 10.3],
  ['Fencing', 6.0],
  ['Gymnastics', 3.8],
  ['Cheerleading', 6.0],
  ['Track & Field', 8.0, { curve: 'running' }],
  ['Cross Country', 10.0, { curve: 'running', climbs: true }],
  ['Triathlon', 10.0],
  ['Crew (rowing)', 8.5, { curve: 'paddling' }],
  ['Sailing', 3.3],
  ['Figure Skating', 7.0],
  ['Speed Skating', 13.3, { curve: 'skating' }],
  ['Curling', 4.0],
  ['BMX', 8.5],
  ['Road Racing (bike)', 12.0, { curve: 'cycling', climbs: true }],
  ['Archery', 4.3],
  ['Bowling', 3.8],
  ['Paintball', 5.0],
  ['Dance, competitive', 7.8],
  ['Swim Meet', 10.0, { curve: 'swimming' }],
  ['Equestrian', 5.5],
  ['Polo', 8.0],
  ['Parkour', 9.0],
  ['Trail Race', 11.0, { curve: 'trailRunning', climbs: true }],
]

const STRENGTH: string[] = [
  'Barbell Back Squat',
  'Front Squat',
  'Goblet Squat',
  'Hack Squat',
  'Leg Press',
  'Lunges',
  'Walking Lunges',
  'Bulgarian Split Squat',
  'Step-Up',
  'Leg Extension',
  'Leg Curl',
  'Calf Raise',
  'Romanian Deadlift',
  'Deadlift',
  'Sumo Deadlift',
  'Trap Bar Deadlift',
  'Hip Thrust',
  'Glute Bridge',
  'Good Morning',
  'Barbell Bench Press',
  'Incline Bench Press',
  'Decline Bench Press',
  'Dumbbell Bench Press',
  'Dumbbell Fly',
  'Chest Press Machine',
  'Pec Deck',
  'Push-Up',
  'Cable Crossover',
  'Dip',
  'Overhead Press',
  'Dumbbell Shoulder Press',
  'Arnold Press',
  'Push Press',
  'Lateral Raise',
  'Front Raise',
  'Rear Delt Fly',
  'Upright Row',
  'Shrug',
  'Pull-Up',
  'Chin-Up',
  'Lat Pulldown',
  'Seated Cable Row',
  'Barbell Row',
  'Dumbbell Row',
  'Pendlay Row',
  'T-Bar Row',
  'Chest-Supported Row',
  'Face Pull',
  'Straight-Arm Pulldown',
  'Barbell Curl',
  'Dumbbell Curl',
  'Hammer Curl',
  'Incline Curl',
  'Preacher Curl',
  'Cable Curl',
  'Tricep Pushdown',
  'Skull Crusher',
  'Overhead Tricep Extension',
  'Close-Grip Bench Press',
  'Tricep Kickback',
  'Plank',
  'Side Plank',
  'Crunch',
  'Cable Crunch',
  'Sit-Up',
  'Russian Twist',
  'Hanging Leg Raise',
  'Ab Wheel Rollout',
  'Cable Woodchop',
  'Dead Bug',
  'Back Extension',
  'Farmer Carry',
  'Kettlebell Swing',
  'Clean and Press',
  'Power Clean',
  'Snatch',
  'Thruster',
  'Box Jump',
  'Wall Ball',
  'Turkish Get-Up',
  'Landmine Press',
  'Nordic Curl',
  'Reverse Hyper',
  'Wrist Curl',
  'Neck Curl',
]

const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

const rows = (list: Row[], kind: ExerciseKind): ExerciseDef[] =>
  list.map(([name, met, o]) => ({ id: `${kind}:${slug(name)}`, name, kind, met, ...(o ?? {}) }))

export const EXERCISES: ExerciseDef[] = [
  ...rows(CARDIO, 'cardio'),
  ...rows(SPORTS, 'sports'),
  ...STRENGTH.map((name) => ({ id: `strength:${slug(name)}`, name, kind: 'strength' as const })),
]

export const EXERCISE_BY_ID = new Map(EXERCISES.map((e) => [e.id, e]))

export function onTab(e: ExerciseDef, kind: ExerciseKind): boolean {
  return e.kind === kind || (e.also?.includes(kind) ?? false)
}

export function searchExercises(query: string, kind: ExerciseKind): ExerciseDef[] {
  const q = query.trim().toLowerCase()
  const pool = EXERCISES.filter((e) => onTab(e, kind))
  /* No query: catalog order, which puts the everyday ones (walking, running,
     cycling; football, soccer, basketball) at the top, with the activities
     filed here first and the crossovers from the other tab after them. */
  if (!q) return [...pool.filter((e) => e.kind === kind), ...pool.filter((e) => e.kind !== kind)]
  return pool
    .filter((e) => e.name.toLowerCase().includes(q))
    .sort((a, b) => {
      const ai = a.name.toLowerCase().indexOf(q)
      const bi = b.name.toLowerCase().indexOf(q)
      return ai - bi || a.name.length - b.name.length
    })
}
