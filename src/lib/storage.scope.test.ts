import { beforeEach, describe, expect, it } from 'vitest'
import { defaultData, localAdapter, scopedKey, setStorageScope, syncedStore } from './storage'

/* No DOM in the test runner; a Map is all the adapter needs. */
const mem = new Map<string, string>()
globalThis.localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(),
  key: () => null,
  get length() {
    return mem.size
  },
} as Storage

describe('per-account storage slots', () => {
  beforeEach(() => {
    localStorage.clear()
    setStorageScope(null)
  })

  it('keeps each account in its own slot and the guest in the bare key', () => {
    const guest = defaultData()
    guest.profile.firstName = 'Guest'
    localAdapter.save(guest)

    setStorageScope('user-a')
    expect(localAdapter.load()).toBeNull()
    const a = defaultData()
    a.profile.firstName = 'A'
    localAdapter.save(a)

    setStorageScope('user-b')
    expect(localAdapter.load()).toBeNull()

    setStorageScope('user-a')
    expect(localAdapter.load()?.profile.firstName).toBe('A')
    expect(localAdapter.loadGuest()?.profile.firstName).toBe('Guest')

    setStorageScope(null)
    expect(localAdapter.load()?.profile.firstName).toBe('Guest')
    expect(scopedKey('x')).toBe('x')
    expect(scopedKey('x', 'u')).toBe('x.u')
  })

  it('scopes the synced snapshot the same way', () => {
    setStorageScope('user-a')
    syncedStore.save(defaultData())
    setStorageScope('user-b')
    expect(syncedStore.load()).toBeNull()
    setStorageScope('user-a')
    expect(syncedStore.load()).not.toBeNull()
  })
})
