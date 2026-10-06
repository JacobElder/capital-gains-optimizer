import { describe, expect, it } from 'vitest'
import { anonymizePortfolio, generateSamplePortfolio } from './demoData'
import { analyzePosition } from './taxEngine'
import type { Position, UserSettings } from '../types'

const today = new Date('2026-10-06T12:00:00')
const settings: UserSettings = { filingStatus: 'mfj', annualTaxableIncome: 287_350, stateCode: 'CA', nycResident: false }

const lot = (id: string, ticker: string, purchaseDate: string, shares: number, basis: number, price: number): Position => ({
  id, ticker, name: ticker, shares, costBasisPerShare: basis, purchaseDate, currentPrice: price, createdAt: '', updatedAt: '',
})

const real = {
  positions: [
    lot('a', 'NVDA', '2026-03-10', 37, 112.4, 181.2),
    lot('b', 'NVDA', '2025-02-01', 12, 98.1, 181.2),
    lot('c', 'AAPL', '2026-08-20', 55.699, 240.5, 221.3),
    lot('d', 'SPY', '2025-10-06', 20, 560, 655),
  ],
  futureVests: [{ id: 'v', ticker: 'NVDA', name: 'NVIDIA', awardId: '1234567', awardDate: '2025-01-01', vestDate: '2026-12-15', sharesGross: 40 }],
  settings,
}

describe('anonymizePortfolio', () => {
  it('is deterministic for a seed and different across seeds', () => {
    expect(anonymizePortfolio(real, 42, true, today)).toEqual(anonymizePortfolio(real, 42, true, today))
    expect(anonymizePortfolio(real, 42, true, today)).not.toEqual(anonymizePortfolio(real, 43, true, today))
  })

  it('hides tickers, amounts and income', () => {
    const anon = anonymizePortfolio(real, 7, true, today)
    const realTickers = new Set(real.positions.map(p => p.ticker))
    for (const p of anon.positions) expect(realTickers.has(p.ticker)).toBe(false)
    expect(anon.futureVests[0].ticker).toBe(anon.positions[0].ticker)
    expect(anon.futureVests[0].awardId).not.toBe('1234567')
    expect(anon.settings.annualTaxableIncome % 5000).toBe(0)
    expect(anon.positions.map(p => p.currentPrice)).not.toEqual(real.positions.map(p => p.currentPrice))
  })

  it('keeps each lot short- or long-term and lots of a ticker at one price', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const anon = anonymizePortfolio(real, seed, true, today)
      anon.positions.forEach((p, i) => {
        const before = analyzePosition(real.positions[i], settings, today)
        const after = analyzePosition(p, anon.settings, today)
        expect(after.isLongTerm).toBe(before.isLongTerm)
        expect(p.purchaseDate <= '2026-10-06').toBe(true)
      })
      expect(anon.positions[0].currentPrice).toBe(anon.positions[1].currentPrice)
    }
  })

  it('can keep real tickers when masking is off', () => {
    const anon = anonymizePortfolio(real, 7, false, today)
    expect(anon.positions.map(p => p.ticker)).toEqual(real.positions.map(p => p.ticker))
  })
})

describe('generateSamplePortfolio', () => {
  it('produces a varied, analyzable portfolio', () => {
    for (const seed of [11, 22, 33]) {
      const sample = generateSamplePortfolio(seed, settings, today)
      const analyses = sample.positions.map(p => analyzePosition(p, sample.settings, today))
      expect(sample.positions.length).toBeGreaterThanOrEqual(12)
      expect(analyses.some(a => !a.isLongTerm)).toBe(true)
      expect(analyses.some(a => a.isLongTerm)).toBe(true)
      expect(sample.futureVests.length).toBeGreaterThan(0)
      for (const p of sample.positions) {
        expect(p.costBasisPerShare).toBeGreaterThan(0)
        expect(p.purchaseDate <= '2026-10-06').toBe(true)
      }
    }
  })
})
