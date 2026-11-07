import { describe, expect, it } from 'vitest'
import {
  challengeState,
  challengeWhen,
  inviteMessage,
  makeInviteCode,
  parseInvite,
  points,
  standings,
  type MemberWeek,
} from './crews'

const member = (over: Partial<MemberWeek>): MemberWeek => ({
  userId: 'u',
  loggedDays: null,
  calorieDays: null,
  waterDays: null,
  stepDays: null,
  steps: null,
  streak: null,
  posts: 0,
  kudos: 0,
  ...over,
})

describe('invite codes', () => {
  it('makes eight characters from the safe alphabet', () => {
    const code = makeInviteCode()
    expect(code).toMatch(/^[A-Z2-9]{8}$/)
    expect(code).not.toMatch(/[01OI]/)
  })

  it('finds the code in a link, a path, the app scheme or a bare code', () => {
    expect(parseInvite('https://logpal-two.vercel.app/join/ABCD2345')).toBe('ABCD2345')
    expect(parseInvite('/join/abcd2345?x=1')).toBe('ABCD2345')
    expect(parseInvite('logpal://join/ABCD2345')).toBe('ABCD2345')
    expect(parseInvite('  abcd2345 ')).toBe('ABCD2345')
    expect(parseInvite('https://logpal-two.vercel.app/')).toBeNull()
    expect(parseInvite('ABCD234')).toBeNull()
  })

  it('writes the share message around the challenge when there is one', () => {
    expect(inviteMessage('Morning Walkers', 'ABCD2345', '30-Day Healthy Habits')).toBe(
      'Join 30-Day Healthy Habits with the Morning Walkers crew on LogPal! https://logpal-two.vercel.app/join/ABCD2345',
    )
    expect(inviteMessage('Morning Walkers', 'ABCD2345')).toContain('Join my Morning Walkers crew')
  })
})

describe('challenges', () => {
  it('knows upcoming, active and ended', () => {
    expect(challengeState('2026-11-10', '2026-11-20', '2026-11-06')).toBe('upcoming')
    expect(challengeState('2026-11-01', '2026-11-20', '2026-11-06')).toBe('active')
    expect(challengeState('2026-11-01', '2026-11-05', '2026-11-06')).toBe('ended')
  })

  it('says how long is left in words', () => {
    expect(challengeWhen('2026-11-07', '2026-11-20', '2026-11-06')).toBe('starts tomorrow')
    expect(challengeWhen('2026-11-01', '2026-11-06', '2026-11-06')).toBe('last day')
    expect(challengeWhen('2026-11-01', '2026-11-09', '2026-11-06')).toBe('3 days left')
  })
})

describe('leaderboard', () => {
  it('weights logging over goals and caps the chat', () => {
    expect(points(member({ loggedDays: 5, waterDays: 2 }))).toBe(12)
    expect(points(member({ loggedDays: 2, waterDays: 2, stepDays: 2, calorieDays: 2 }))).toBe(10)
    expect(points(member({ posts: 40 }))).toBe(5)
  })

  it('ranks and describes, and tells quiet from unshared', () => {
    const s = standings([
      member({ userId: 'a', loggedDays: 3, posts: 1 }),
      member({ userId: 'b', loggedDays: 6, stepDays: 4 }),
      member({ userId: 'c' }),
      member({ userId: 'd', loggedDays: 0 }),
    ])
    expect(s.map((x) => x.userId)).toEqual(['b', 'a', 'c', 'd'])
    expect(s[0].detail).toBe('6 logged · 4 goals hit')
    expect(s[1].detail).toBe('3 logged · 1 cheer')
    expect(s[2].detail).toBe('Shares nothing yet')
    expect(s[3].detail).toBe('0 logged')
  })
})
