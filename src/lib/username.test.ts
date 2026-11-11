import { describe, expect, it } from 'vitest'
import { usernameLocked, usernameProblem, usernameUnlocksAt } from './username'

describe('username rules', () => {
  it('rejects short, long and odd handles', () => {
    expect(usernameProblem('ab')).toMatch(/three/)
    expect(usernameProblem('a'.repeat(21))).toMatch(/twenty/)
    expect(usernameProblem('phil lip')).toMatch(/letters/)
    expect(usernameProblem('Phil.lip_1')).toBeNull()
  })

  it('locks a handle for seven days after it was set', () => {
    const set = new Date('2026-11-11T10:00:00Z')
    expect(usernameUnlocksAt(set).toISOString()).toBe('2026-11-18T10:00:00.000Z')
    expect(usernameLocked(set, new Date('2026-11-17T10:00:00Z'))).toBe(true)
    expect(usernameLocked(set, new Date('2026-11-18T10:00:01Z'))).toBe(false)
    expect(usernameLocked(null)).toBe(false)
  })
})
