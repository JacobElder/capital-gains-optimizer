import { describe, expect, it } from 'vitest'
import {
  formToPosition, parseDecimal, perShareFromTotal, validatePositionForm, type PositionFormInput,
} from './positionForm'

const TODAY = '2026-10-24'

function input(o: Partial<PositionFormInput['form']> = {}, modes: Partial<PositionFormInput> = {}): PositionFormInput {
  return {
    form: {
      ticker: ' goog ', name: ' Alphabet ', shares: '3', costBasisPerShare: '100', purchaseDate: '2026-01-15',
      currentPrice: '150', volatilityOverride: '', ...o,
    },
    priceMode: 'per-share', basisMode: 'per-share', totalPriceInput: '', totalBasisInput: '', today: TODAY,
    ...modes,
  }
}

describe('parseDecimal', () => {
  it('accepts plain decimals and rejects junk', () => {
    expect(parseDecimal('12.5')).toBe(12.5)
    expect(parseDecimal(' 7 ')).toBe(7)
    expect(parseDecimal('12abc')).toBeNaN()
    expect(parseDecimal('')).toBeNaN()
  })
})

describe('validatePositionForm', () => {
  it('accepts a complete form', () => {
    expect(validatePositionForm(input())).toEqual({})
  })

  it('requires ticker, name, positive shares and a date', () => {
    const errs = validatePositionForm(input({ ticker: '  ', name: '', shares: '0', purchaseDate: '' }))
    expect(Object.keys(errs).sort()).toEqual(['name', 'purchaseDate', 'shares', 'ticker'])
    expect(validatePositionForm(input({ shares: '-1' })).shares).toBeDefined()
    expect(validatePositionForm(input({ shares: '3abc' })).shares).toBeDefined()
  })

  it('allows a zero cost basis but not a negative one, and requires a positive price', () => {
    expect(validatePositionForm(input({ costBasisPerShare: '0' }))).toEqual({})
    expect(validatePositionForm(input({ costBasisPerShare: '-1' })).costBasisPerShare).toBe('Must be ≥ 0')
    expect(validatePositionForm(input({ currentPrice: '0' })).currentPrice).toBe('Must be > 0')
  })

  it('validates totals in total-entry mode', () => {
    const errs = validatePositionForm(input({}, { priceMode: 'total', basisMode: 'total' }))
    expect(errs).toEqual({ currentPrice: 'Enter total market value', costBasisPerShare: 'Enter total acquisition cost' })
  })

  it('rejects future purchase dates but allows today', () => {
    expect(validatePositionForm(input({ purchaseDate: '2026-10-25' })).purchaseDate).toBe('Cannot be in the future')
    expect(validatePositionForm(input({ purchaseDate: TODAY }))).toEqual({})
  })

  it('checks the volatility override range', () => {
    expect(validatePositionForm(input({ volatilityOverride: '35' }))).toEqual({})
    for (const bad of ['0', '-5', '500', 'abc']) {
      expect(validatePositionForm(input({ volatilityOverride: bad })).volatilityOverride).toBeDefined()
    }
  })
})

describe('formToPosition', () => {
  it('trims and upper-cases, and keeps a valid override', () => {
    expect(formToPosition(input({ volatilityOverride: '35' }))).toEqual({
      ticker: 'GOOG', name: 'Alphabet', shares: 3, costBasisPerShare: 100, purchaseDate: '2026-01-15',
      currentPrice: 150, volatilityOverride: 35,
    })
    expect(formToPosition(input()).volatilityOverride).toBeUndefined()
  })

  it('converts totals at full precision, so the total round-trips', () => {
    const p = formToPosition(input({}, { basisMode: 'total', totalBasisInput: '1000', priceMode: 'total', totalPriceInput: '1300' }))
    expect(p.costBasisPerShare * p.shares).toBeCloseTo(1000, 9)
    expect(p.currentPrice * p.shares).toBeCloseTo(1300, 9)
  })

  it('perShareFromTotal needs positive shares', () => {
    expect(perShareFromTotal('1000', '0')).toBeNaN()
    expect(perShareFromTotal('', '3')).toBeNaN()
  })
})
