import { describe, expect, it } from 'vitest'
import { parseGenericCSV, TEMPLATE_CSV } from './SchwabImportModal'

describe('generic CSV import', () => {
  it('round-trips the downloadable template', () => {
    const { rows, errors } = parseGenericCSV(TEMPLATE_CSV)
    expect(errors).toEqual([])
    expect(rows[0]).toMatchObject({ ticker: 'AAPL', shares: 25, costBasisPerShare: 210, currentPrice: 232.5, purchaseDate: '2025-11-03' })
  })

  it('does not read "Acquisition Price" as the current price', () => {
    const csv = 'Symbol,Quantity,Date Acquired,Acquisition Price,Market Value\nXYZ,10,01/15/2026,50.00,"$800.00"\n'
    const { rows } = parseGenericCSV(csv)
    expect(rows[0]).toMatchObject({ costBasisPerShare: 50, currentPrice: 80, purchaseDate: '2026-01-15' })
  })
})
