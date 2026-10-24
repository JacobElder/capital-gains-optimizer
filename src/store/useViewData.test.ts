import { describe, expect, it } from 'vitest'
import { selectViewData, type ViewSource } from './useViewData'
import type { FutureVestLot, Position } from '../types'

const today = new Date('2026-10-24T12:00:00')

// Distinctive real values, so any one leaking into the demo output is detectable
const lot = (id: string, ticker: string, name: string, purchaseDate: string, shares: number, basis: number, price: number, vol?: number): Position => ({
  id, ticker, name, shares, costBasisPerShare: basis, purchaseDate, currentPrice: price,
  volatilityOverride: vol, createdAt: `2026-03-0${id.length}T09:13:27.441Z`, updatedAt: '2026-04-11T17:42:05.918Z',
})
const vest: FutureVestLot = {
  id: 'real-vest-77', ticker: 'NVDA', name: 'NVIDIA Corporation', awardId: '8675309', awardDate: '2025-01-07',
  vestDate: '2026-12-15', sharesGross: 413,
}
const state: ViewSource = {
  positions: [
    lot('real-id-1', 'NVDA', 'NVIDIA Corporation', '2026-03-10', 37.123, 112.47, 181.23, 47),
    lot('real-id-22', 'NVDA', 'NVIDIA Corporation', '2025-02-01', 12.5, 98.13, 181.23),
    lot('real-id-333', 'AAPL', 'Apple Inc.', '2026-08-20', 55.699, 240.51, 221.37),
  ],
  futureVests: [vest],
  settings: { filingStatus: 'mfj', annualTaxableIncome: 287_351, stateCode: 'CA', nycResident: false },
  privacy: { mode: 'off', seed: 42, maskTickers: true },
}

const REAL_STRINGS = ['NVDA', 'AAPL', 'NVIDIA Corporation', 'Apple Inc.', '8675309', 'real-vest-77',
  ...state.positions.flatMap(p => [p.id, p.createdAt, p.updatedAt])]
const REAL_NUMBERS = [287_351, 413, 47, ...state.positions.flatMap(p => [p.shares, p.costBasisPerShare, p.currentPrice])]

/** Every string and number anywhere inside `x`. */
function leaves(x: unknown, out: Array<string | number> = []): Array<string | number> {
  if (typeof x === 'string' || typeof x === 'number') out.push(x)
  else if (Array.isArray(x)) x.forEach(v => leaves(v, out))
  else if (x && typeof x === 'object') Object.values(x).forEach(v => leaves(v, out))
  return out
}

function expectNoLeaks(view: unknown) {
  const all = leaves(view)
  for (const s of REAL_STRINGS) expect(all.filter(v => typeof v === 'string' && v.includes(s)), s).toEqual([])
  for (const n of REAL_NUMBERS) expect(all.filter(v => v === n), String(n)).toEqual([])
}

describe('selectViewData', () => {
  it('shows the real data when privacy is off', () => {
    const view = selectViewData(state, today)
    expect(view.isDemo).toBe(false)
    expect(view.positions).toBe(state.positions)
  })

  it('falls back to real data, not a demo, for an unknown mode', () => {
    const view = selectViewData({ ...state, privacy: { ...state.privacy, mode: 'bogus' as never } }, today)
    expect(view.isDemo).toBe(false)
  })

  for (const seed of [1, 42, 999]) {
    it(`anonymize mode leaks no real ticker, name, id, timestamp or amount (seed ${seed})`, () => {
      const view = selectViewData({ ...state, privacy: { mode: 'anonymize', seed, maskTickers: true } }, today)
      expect(view.isDemo).toBe(true)
      expect(view.positions).toHaveLength(3)
      expectNoLeaks(view)
    })

    it(`sample mode contains none of the real portfolio (seed ${seed})`, () => {
      const view = selectViewData({ ...state, privacy: { mode: 'sample', seed, maskTickers: true } }, today)
      expect(view.isDemo).toBe(true)
      expectNoLeaks(view)
    })
  }

  it('never modifies the real state', () => {
    const snapshot = JSON.stringify(state)
    selectViewData({ ...state, privacy: { mode: 'anonymize', seed: 3, maskTickers: true } }, today)
    selectViewData({ ...state, privacy: { mode: 'sample', seed: 3, maskTickers: true } }, today)
    expect(JSON.stringify(state)).toBe(snapshot)
  })
})
