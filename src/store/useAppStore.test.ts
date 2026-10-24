import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS, isDemoParam, mergePersisted, useAppStore } from './useAppStore'
import type { Position } from '../types'

const current = {
  settings: { ...DEFAULT_SETTINGS },
  positions: [] as Position[],
  futureVests: [],
  privacy: { mode: 'off' as const, seed: 1, maskTickers: true },
}

const savedLot = {
  id: 'a', ticker: 'AAPL', name: 'Apple', shares: 10, costBasisPerShare: 100, purchaseDate: '2026-01-15',
  currentPrice: 150, createdAt: 'c', updatedAt: 'u',
}

describe('isDemoParam', () => {
  it('turns demo on for ?demo and ?demo=1, and off for 0/false/off', () => {
    expect(isDemoParam('?demo')).toBe(true)
    expect(isDemoParam('?demo=1')).toBe(true)
    expect(isDemoParam('?x=1&demo=true')).toBe(true)
    for (const s of ['', '?other', '?demo=0', '?demo=false', '?demo=off', '?demo=NO']) expect(isDemoParam(s)).toBe(false)
  })
})

describe('mergePersisted', () => {
  it('fills settings fields missing from an older save with defaults', () => {
    const merged = mergePersisted({ settings: { filingStatus: 'mfj', annualTaxableIncome: 300_000, stateCode: 'CA' } }, current, false)
    expect(merged.settings).toEqual({ filingStatus: 'mfj', annualTaxableIncome: 300_000, stateCode: 'CA', nycResident: false })
  })

  it('replaces wrong-typed settings with defaults', () => {
    const merged = mergePersisted({ settings: { filingStatus: 'bogus', annualTaxableIncome: 'lots', stateCode: 7, nycResident: 'yes' } }, current, false)
    expect(merged.settings).toEqual(DEFAULT_SETTINGS)
  })

  it('survives null or malformed collections', () => {
    const merged = mergePersisted({ positions: null, futureVests: 'x', privacy: null, settings: null }, current, false)
    expect(merged.positions).toEqual([])
    expect(merged.futureVests).toEqual([])
    expect(merged.privacy).toEqual(current.privacy)
  })

  it('drops lots that would crash the views and repairs optional fields', () => {
    const merged = mergePersisted({
      positions: [savedLot, null, { ...savedLot, id: 'b', shares: 'ten' }, { id: 'c' }, { ...savedLot, id: 'd', name: undefined, volatilityOverride: -3 }],
    }, current, false)
    expect(merged.positions.map(p => p.id)).toEqual(['a', 'd'])
    expect(merged.positions[1].name).toBe('AAPL')
    expect(merged.positions[1].volatilityOverride).toBeUndefined()
  })

  it('treats a missing or non-object save as a fresh start', () => {
    for (const p of [undefined, null, 42, 'junk']) expect(mergePersisted(p, current, false)).toEqual(current)
  })

  it('opens in sample mode for a demo link', () => {
    expect(mergePersisted({ privacy: { mode: 'off', seed: 9, maskTickers: false } }, current, true).privacy)
      .toEqual({ mode: 'sample', seed: 9, maskTickers: false })
  })
})

describe('store actions', () => {
  beforeEach(() => {
    useAppStore.setState({ positions: [], futureVests: [], settings: { ...DEFAULT_SETTINGS } })
  })

  const lot = { ticker: 'AAPL', name: 'Apple', shares: 10, costBasisPerShare: 100, purchaseDate: '2026-01-15', currentPrice: 150 }

  it('adds positions with an id and timestamps', () => {
    useAppStore.getState().addPosition(lot)
    const [p] = useAppStore.getState().positions
    expect(p).toMatchObject(lot)
    expect(p.id).toBeTruthy()
    expect(p.createdAt).toBe(p.updatedAt)
  })

  it('updates one position, keeping createdAt and bumping updatedAt', () => {
    useAppStore.setState({ positions: [{ ...lot, id: 'x', createdAt: '2020-01-01T00:00:00.000Z', updatedAt: '2020-01-01T00:00:00.000Z' }] })
    useAppStore.getState().updatePosition('x', { shares: 20 })
    useAppStore.getState().updatePosition('missing', { shares: 99 })
    const [p] = useAppStore.getState().positions
    expect(p.shares).toBe(20)
    expect(p.createdAt).toBe('2020-01-01T00:00:00.000Z')
    expect(p.updatedAt > p.createdAt).toBe(true)
    expect(useAppStore.getState().positions).toHaveLength(1)
  })

  it('deletes and clears positions and vests', () => {
    const s = useAppStore.getState()
    s.addPosition(lot)
    s.addPosition({ ...lot, ticker: 'MSFT' })
    s.deletePosition(useAppStore.getState().positions[0].id)
    expect(useAppStore.getState().positions.map(p => p.ticker)).toEqual(['MSFT'])
    s.clearPositions()
    expect(useAppStore.getState().positions).toEqual([])
    s.setFutureVests([{ id: 'v', ticker: 'GOOG', name: 'G', awardId: '', awardDate: '', vestDate: '2027-01-25', sharesGross: 5 }])
    expect(useAppStore.getState().futureVests).toHaveLength(1)
    s.clearFutureVests()
    expect(useAppStore.getState().futureVests).toEqual([])
  })

  it('merges settings and privacy updates; reshuffling changes only the seed', () => {
    const s = useAppStore.getState()
    s.setSettings({ stateCode: 'CA' })
    expect(useAppStore.getState().settings).toEqual({ ...DEFAULT_SETTINGS, stateCode: 'CA' })
    s.setPrivacy({ mode: 'anonymize' })
    const before = useAppStore.getState().privacy
    expect(before.mode).toBe('anonymize')
    vi.spyOn(Math, 'random').mockReturnValueOnce(0.123456)
    s.reshuffleDemo()
    const after = useAppStore.getState().privacy
    expect(after).toEqual({ ...before, seed: Math.floor(0.123456 * 2 ** 31) })
    vi.restoreAllMocks()
  })
})

/** Imports a fresh copy of the store against a fake URL and localStorage. */
async function loadStore(search: string, saved?: object) {
  const storage = new Map<string, string>()
  if (saved) storage.set('capital-gains-optimizer', JSON.stringify({ state: saved, version: 0 }))
  vi.stubGlobal('window', {
    location: { search },
    localStorage: {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => { storage.set(k, v) },
      removeItem: (k: string) => { storage.delete(k) },
    },
  })
  vi.resetModules()
  const { useAppStore: store } = await import('./useAppStore')
  await store.persist.rehydrate()
  const written = () => JSON.parse(storage.get('capital-gains-optimizer')!).state
  return { store, written }
}

describe('persistence', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  const saved = { settings: DEFAULT_SETTINGS, positions: [savedLot], futureVests: [], privacy: { mode: 'off', seed: 5, maskTickers: true } }

  it('saves only the data, not UI-only state', async () => {
    const { store, written } = await loadStore('', saved)
    store.getState().setIsAddingPosition(true)
    expect(Object.keys(written()).sort()).toEqual(['futureVests', 'positions', 'privacy', 'settings'])
  })

  it('a demo link opens in sample mode without leaving the saved mode stuck on sample', async () => {
    const { store, written } = await loadStore('?demo', saved)
    expect(store.getState().privacy.mode).toBe('sample')
    expect(store.getState().positions.map(p => p.id)).toEqual(['a']) // real data untouched

    store.getState().setSettings({ stateCode: 'CA' }) // any change writes to storage
    expect(written().settings.stateCode).toBe('CA')
    expect(written().privacy.mode).toBe('off')
  })

  it('a demo link works on a first visit with nothing saved', async () => {
    const { store } = await loadStore('?demo')
    expect(store.getState().privacy.mode).toBe('sample')
  })

  it('?demo=0 does not turn demo on', async () => {
    const { store } = await loadStore('?demo=0', saved)
    expect(store.getState().privacy.mode).toBe('off')
  })
})
