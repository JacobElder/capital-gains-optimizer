import { describe, expect, it } from 'vitest'
import { format } from 'date-fns'
import { analyzePosition, longTermDate, probBelow, taxOnGain } from './taxEngine'
import { federalLTCGTax, federalSTCGTax, niitTax } from '../data/federalTaxBrackets'
import { stateTaxOnGain } from '../data/stateTaxData'
import type { Position, UserSettings } from '../types'

const settings: UserSettings = { filingStatus: 'single', annualTaxableIncome: 150_000, stateCode: 'TX', nycResident: false }

function position(overrides: Partial<Position> = {}): Position {
  return {
    id: 'p', ticker: 'SPY', name: 'Test', shares: 100, costBasisPerShare: 100,
    purchaseDate: '2025-06-01', currentPrice: 150, createdAt: '', updatedAt: '',
    ...overrides,
  }
}

const d = (s: string) => new Date(`${s}T12:00:00`)
const fmt = (date: Date) => format(date, 'yyyy-MM-dd')

describe('holding period', () => {
  it('becomes long-term the day after the one-year anniversary', () => {
    expect(fmt(longTermDate('2025-01-15'))).toBe('2026-01-16')
    expect(fmt(longTermDate('2023-01-15'))).toBe('2024-01-16') // spans a leap day
    expect(fmt(longTermDate('2024-02-29'))).toBe('2025-03-01')
  })

  it('is not off by one in non-leap years', () => {
    const p = position({ purchaseDate: '2025-01-15' })
    expect(analyzePosition(p, settings, d('2026-01-15')).isLongTerm).toBe(false)
    expect(analyzePosition(p, settings, d('2026-01-15')).daysUntilLongTerm).toBe(1)
    expect(analyzePosition(p, settings, d('2026-01-16')).isLongTerm).toBe(true)
  })
})

describe('federal tax stacking', () => {
  it('spreads a short-term gain across ordinary brackets', () => {
    // 100k → 150k single: 5,700 @ 22% + 44,300 @ 24%
    expect(federalSTCGTax(100_000, 50_000, 'single')).toBeCloseTo(5_700 * 0.22 + 44_300 * 0.24, 6)
  })

  it('stacks long-term gains on top of ordinary income', () => {
    // 40k ordinary: first 9,450 of gain at 0%, rest at 15%
    expect(federalLTCGTax(40_000, 20_000, 'single')).toBeCloseTo(10_550 * 0.15, 6)
  })

  it('applies NIIT only to the portion above the threshold', () => {
    expect(niitTax(190_000, 30_000, 'single')).toBeCloseTo(20_000 * 0.038, 6)
    expect(niitTax(100_000, 30_000, 'single')).toBe(0)
  })

  it('charges nothing on losses', () => {
    expect(taxOnGain(-5_000, false, settings).total).toBe(0)
  })
})

describe('Washington', () => {
  it('only taxes long-term gains above the deduction', () => {
    expect(stateTaxOnGain('WA', 150_000, 100_000, 'single', true)).toBe(0)
    expect(stateTaxOnGain('WA', 150_000, 500_000, 'single', false)).toBe(0)
    expect(stateTaxOnGain('WA', 150_000, 500_000, 'single', true)).toBeCloseTo(0.07 * 222_000, 6)
  })

  it('does not flag ordinary-sized WA gains as STCG-preferred', () => {
    const a = analyzePosition(position(), { ...settings, stateCode: 'WA' }, d('2026-01-01'))
    expect(a.stcgPreferred).toBe(false)
  })
})

describe('2026 state rules', () => {
  it('does not tax capital gains in Missouri', () => {
    expect(stateTaxOnGain('MO', 150_000, 50_000, 'single', false)).toBe(0)
  })
  it('adds Maryland\'s 2% capital gains surtax above $350K', () => {
    const below = stateTaxOnGain('MD', 200_000, 100_000, 'single', true)
    const above = stateTaxOnGain('MD', 300_000, 100_000, 'single', true)
    expect(below).toBeCloseTo(50_000 * 0.055 + 50_000 * 0.0575, 6)
    expect(above).toBeCloseTo(100_000 * 0.0575 + 0.02 * 100_000, 6)
  })
  it('adds the Massachusetts 4% surtax only above the threshold', () => {
    expect(stateTaxOnGain('MA', 100_000, 50_000, 'single', true)).toBeCloseTo(2_500, 6)
    expect(stateTaxOnGain('MA', 1_050_000, 100_000, 'single', true)).toBeCloseTo(5_000 + 0.04 * 66_850, 6)
  })
})

describe('break-even', () => {
  const today = d('2026-01-01')

  it('equates after-tax proceeds of waiting and selling now', () => {
    const a = analyzePosition(position(), settings, today)
    const gainAtBreakeven = a.breakevenPrice * 100 - 10_000
    const netWait = a.breakevenPrice * 100 - taxOnGain(gainAtBreakeven, true, settings).total
    expect(netWait).toBeCloseTo(a.netProceedsNow, 4)
    expect(a.breakevenPrice).toBeLessThan(150)
    expect(a.breakevenPrice).toBeGreaterThan(100)
  })

  it('matches the closed-form formula when rates are flat', () => {
    // Small gain well inside one bracket in a no-tax state → constant rates
    const p = position({ shares: 10, costBasisPerShare: 100, currentPrice: 110 })
    const a = analyzePosition(p, settings, today)
    const s = 0.24, l = 0.15
    const netPerShare = 110 - 10 * s
    expect(a.breakevenPrice).toBeCloseTo((netPerShare - 100 * l) / (1 - l), 6)
  })

  it('expected gain from waiting is about the tax savings when the price cannot fall to basis', () => {
    const p = position({ shares: 10, costBasisPerShare: 10, currentPrice: 110, volatilityOverride: 15, purchaseDate: '2025-12-01' })
    const a = analyzePosition(p, settings, today)
    expect(a.expectedGainFromWaiting).toBeCloseTo(a.taxSavingsFromWaiting, 0)
    expect(a.expectedShortfall).toBeGreaterThan(0)
  })
})

describe('risk rating', () => {
  const today = d('2026-01-01')
  it('rates a big cushion on a calm stock as low risk', () => {
    const a = analyzePosition(position({ costBasisPerShare: 40, currentPrice: 150, volatilityOverride: 15, purchaseDate: '2025-11-01' }), settings, today)
    expect(a.riskLevel).toBe('low')
  })
  it('rates a thin gain on a volatile stock as high risk', () => {
    const a = analyzePosition(position({ costBasisPerShare: 140, currentPrice: 150, volatilityOverride: 70, purchaseDate: '2025-06-01' }), settings, today)
    expect(a.riskLevel).toBe('high')
  })
})

describe('probability model', () => {
  it('is a bit above 50% at-the-money for a driftless lognormal', () => {
    const p = probBelow(100, 100, 0.2)
    expect(p).toBeGreaterThan(0.5)
    expect(p).toBeLessThan(0.55)
  })

  it('rises with volatility for an out-of-the-money break-even', () => {
    expect(probBelow(100, 90, 0.4)).toBeGreaterThan(probBelow(100, 90, 0.1))
  })
})
