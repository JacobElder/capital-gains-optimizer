import { describe, expect, it } from 'vitest'
import {
  TEMPLATE_CSV, cleanNumber, dedupeRows, detectColumns, isEACFormat, isTicker, parseDate,
  parseEACFutureVests, parseEACText, parseGenericCSV, parseText, splitCSVLine, type ParsedRow,
} from './csvImport'

const TODAY = '2026-10-24'

describe('parseDate', () => {
  it('accepts the supported formats', () => {
    expect(parseDate('2026-01-15', TODAY)).toBe('2026-01-15')
    expect(parseDate('1/5/2026', TODAY)).toBe('2026-01-05')
    expect(parseDate('01/15/2026', TODAY)).toBe('2026-01-15')
    expect(parseDate('06-25-2025', TODAY)).toBe('2025-06-25')
    expect(parseDate('"01/15/2026"', TODAY)).toBe('2026-01-15')
    expect(parseDate('2024-02-29', TODAY)).toBe('2024-02-29')
  })
  it('maps two-digit years up to this year to 20xx and later ones to 19xx', () => {
    expect(parseDate('1/5/26', TODAY)).toBe('2026-01-05')
    expect(parseDate('1/5/99', TODAY)).toBe('1999-01-05')
  })
  it('rejects anything that is not a real date', () => {
    for (const bad of ['', 'N/A', '--', '13/45/2026', '2026-13-01', '2025-02-29', '2/30/2026',
      'Jan 15, 2026', '2026/01/15', '2026-1-5']) {
      expect(parseDate(bad, TODAY)).toBe('')
    }
  })
})

describe('cleanNumber', () => {
  it('parses money, percents and accounting negatives', () => {
    expect(cleanNumber('$1,234.56')).toBe(1234.56)
    expect(cleanNumber('"1,250"')).toBe(1250)
    expect(cleanNumber('12.5%')).toBe(12.5)
    expect(cleanNumber('(123.45)')).toBe(-123.45)
    expect(cleanNumber('-5')).toBe(-5)
    expect(cleanNumber('.5')).toBe(0.5)
  })
  it('rejects placeholders and junk', () => {
    for (const bad of ['', '--', 'N/A', '12abc', 'abc', '1.2.3']) expect(cleanNumber(bad)).toBeNaN()
  })
})

describe('splitCSVLine', () => {
  it('honors quotes, including escaped quotes', () => {
    expect(splitCSVLine('a,"b, c",d')).toEqual(['a', 'b, c', 'd'])
    expect(splitCSVLine('"He said ""hi""",x')).toEqual(['He said "hi"', 'x'])
  })
  it('splits tab-separated lines on tabs only, so "1,200" stays one cell', () => {
    expect(splitCSVLine('AAPL\t1,200\t$1,000.00', '\t')).toEqual(['AAPL', '1,200', '$1,000.00'])
  })
})

describe('isTicker', () => {
  it('accepts real symbols and rejects footer text', () => {
    for (const t of ['AAPL', 'BRK.B', 'BF-B', 'GOOG']) expect(isTicker(t)).toBe(true)
    for (const t of ['ACCOUNT TOTAL', 'CASH & CASH INVESTMENTS', '--', '', '123']) expect(isTicker(t)).toBe(false)
  })
})

describe('detectColumns', () => {
  it('reads a Schwab Positions export, with totals divided per share', () => {
    const cols = detectColumns(['Symbol', 'Description', 'Qty (Quantity)', 'Date Acquired', 'Cost Basis', 'Mkt Val (Market Value)'])
    expect(cols).toMatchObject({ ticker: 0, name: 1, shares: 2, date: 3, costBasis: 4, currentPrice: 5, costBasisIsTotal: true, currentPriceIsTotal: true })
  })
  it('prefers per-share columns when present', () => {
    const cols = detectColumns(['Ticker', 'Shares', 'Purchase Date', 'Cost Per Share', 'Current Price'])
    expect(cols).toMatchObject({ costBasisIsTotal: false, currentPriceIsTotal: false })
  })
  it('returns null without the required columns', () => {
    expect(detectColumns(['Symbol', 'Shares'])).toBeNull()
  })
})

describe('parseGenericCSV', () => {
  it('round-trips the downloadable template', () => {
    const { rows, errors } = parseGenericCSV(TEMPLATE_CSV, TODAY)
    expect(errors).toEqual([])
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ ticker: 'AAPL', shares: 25, costBasisPerShare: 210, currentPrice: 232.5, purchaseDate: '2025-11-03', name: 'Apple Inc.' })
    expect(rows[1]).toMatchObject({ ticker: 'MSFT', shares: 10.5 })
  })

  it('does not read "Acquisition Price" as the current price', () => {
    const csv = 'Symbol,Quantity,Date Acquired,Acquisition Price,Market Value\nXYZ,10,01/15/2026,50.00,"$800.00"\n'
    const { rows } = parseGenericCSV(csv, TODAY)
    expect(rows[0]).toMatchObject({ costBasisPerShare: 50, currentPrice: 80, purchaseDate: '2026-01-15' })
  })

  it('reads a tab-separated spreadsheet paste with thousands separators', () => {
    const tsv = 'Symbol\tShares\tDate Acquired\tCost Per Share\tMarket Value\nAAPL\t1,200\t01/15/2026\t150\t$240,000.00\n'
    const { rows, errors } = parseGenericCSV(tsv, TODAY)
    expect(errors).toEqual([])
    expect(rows[0]).toMatchObject({ ticker: 'AAPL', shares: 1200, purchaseDate: '2026-01-15', costBasisPerShare: 150, currentPrice: 200 })
  })

  it('rejects invalid and future dates', () => {
    const csv = 'Symbol,Shares,Date,Cost Per Share,Price\nAAPL,10,N/A,100,150\nMSFT,10,13/45/2026,100,150\nNVDA,10,2099-01-01,100,150\n'
    const { rows, errors } = parseGenericCSV(csv, TODAY)
    expect(rows).toEqual([])
    expect(errors).toEqual([
      'Line 2: invalid date "N/A"',
      'Line 3: invalid date "13/45/2026"',
      'Line 4: date 2099-01-01 is in the future',
    ])
  })

  it('rejects bad numbers, but keeps lowercase tickers, fractional shares and zero cost', () => {
    const csv = 'Symbol,Shares,Date,Cost Per Share,Price\nAAA,12abc,2026-01-01,100,150\nBBB,10,2026-01-01,--,150\nCCC,10,2026-01-01,100,0\nddd,0.5,2026-01-01,0,150\n'
    const { rows, errors } = parseGenericCSV(csv, TODAY)
    expect(errors).toHaveLength(3)
    expect(rows).toEqual([expect.objectContaining({ ticker: 'DDD', shares: 0.5, costBasisPerShare: 0 })])
  })

  it('finds the header below a Schwab preamble and skips footers and repeated headers', () => {
    const csv = [
      '﻿"Positions for account Individual ...123 as of 10/24/2026"',
      '',
      'Symbol,Description,Qty (Quantity),Date Acquired,Cost Basis,Mkt Val (Market Value)',
      'AAPL,Apple Inc,10,01/15/2026,"$1,500.00","$2,300.00"',
      'Cash & Cash Investments,--,--,--,--,"$5,000.00"',
      'Account Total,--,--,--,"$1,500.00","$7,300.00"',
      '"Positions for account Roth ...456 as of 10/24/2026"',
      'Symbol,Description,Qty (Quantity),Date Acquired,Cost Basis,Mkt Val (Market Value)',
      'MSFT,Microsoft,4,03/01/2026,"$1,600.00","$2,000.00"',
    ].join('\r\n')
    const { rows, errors } = parseGenericCSV(csv, TODAY)
    expect(errors).toEqual([])
    expect(rows.map(r => [r.ticker, r.shares, r.costBasisPerShare, r.currentPrice])).toEqual([
      ['AAPL', 10, 150, 230],
      ['MSFT', 4, 400, 500],
    ])
  })

  it('explains what is missing when the columns cannot be found', () => {
    const { rows, errors } = parseGenericCSV('foo,bar\n1,2\n', TODAY)
    expect(rows).toEqual([])
    expect(errors[0]).toMatch(/Could not detect required columns/)
  })
})

// Shaped like a Schwab Equity Awards Center "Equity Details" export
const EAC = [
  'Equity Details for Equity Awards Center',
  '*** RESTRICTED STOCK UNITS ***',
  'Symbol,Award Date,Award ID',
  'GOOG,"02-10-2025",',
  ',Award ID,"7654321"',
  ',"Vest Date","Shares"',
  ',"09-25-2026","40"',
  ',"11-25-2026","1,250"',
  ',"12-25-2026","12.5"',
  '*** EQUITY AWARD SHARES ***',
  'Symbol,Date Acquired,Acquisition Price,Shares,Available to Sell,Market Value',
  'GOOG,"06-25-2025","$170.00","40","25","$7,500.00"',
  'GOOG,"07-25-2025","$180.00","40","0","$0.00"',
  'GOOG,"N/A","$180.00","40","25","$7,500.00"',
  '--,"--","--","--","--","--"',
  'GOOG,"08-25-2025","$185.00","40","25","--"',
  'Totals,,,,"50","$15,000.00"',
  'GOOG,"09-25-2025","$190.00","40","25","$7,500.00"',
].join('\n')

describe('Schwab EAC export', () => {
  it('is detected only by its section markers', () => {
    expect(isEACFormat(EAC)).toBe(true)
    const generic = 'Symbol,Shares,Date,Cost Per Share,Price,Description\nGOOG,1,2026-01-01,1,2,RESTRICTED STOCK UNITS vest\n'
    expect(isEACFormat(generic)).toBe(false)
    expect(parseText(generic, TODAY).rows).toHaveLength(1)
  })

  it('imports holdings: available shares, price from market value, stops at Totals', () => {
    const { rows, errors } = parseEACText(EAC, TODAY)
    expect(rows).toEqual([expect.objectContaining({
      ticker: 'GOOG', shares: 25, costBasisPerShare: 170, currentPrice: 300, purchaseDate: '2025-06-25',
    })])
    // Errors cite the line in the file
    expect(errors).toEqual([
      'Skipped line 14: invalid date "N/A"',
      'Skipped line 16 (GOOG): cannot compute current price — Market Value missing',
    ])
  })

  it('explains a file without the holdings section', () => {
    const { errors } = parseEACText(EAC.slice(0, EAC.indexOf('*** EQUITY')), TODAY)
    expect(errors[0]).toMatch(/EQUITY AWARD SHARES/)
  })

  it('reads future vests with full share counts and skips past ones', () => {
    let n = 0
    const vests = parseEACFutureVests(EAC, TODAY, () => `id-${++n}`)
    expect(vests).toEqual([
      { id: 'id-1', ticker: 'GOOG', name: expect.any(String), awardId: '7654321', awardDate: '2025-02-10', vestDate: '2026-11-25', sharesGross: 1250 },
      { id: 'id-2', ticker: 'GOOG', name: expect.any(String), awardId: '7654321', awardDate: '2025-02-10', vestDate: '2026-12-25', sharesGross: 12.5 },
    ])
  })
})

describe('dedupeRows', () => {
  const row = (o: Partial<ParsedRow> = {}): ParsedRow => ({
    ticker: 'AAPL', name: 'Apple', shares: 10, costBasisPerShare: 150, purchaseDate: '2026-01-15', currentPrice: 200, ...o,
  })
  it('drops lots already held and repeats within the file', () => {
    const existing = [{ ticker: 'AAPL', shares: 10, costBasisPerShare: 150, purchaseDate: '2026-01-15' }]
    const { rows, duplicates } = dedupeRows([row(), row({ shares: 5 }), row({ shares: 5 })], existing)
    expect(rows).toEqual([row({ shares: 5 })])
    expect(duplicates).toBe(2)
  })
  it('keeps lots that differ in date, basis or ticker', () => {
    const { rows } = dedupeRows([row(), row({ purchaseDate: '2026-02-15' }), row({ costBasisPerShare: 151 }), row({ ticker: 'MSFT' })], [])
    expect(rows).toHaveLength(4)
  })
})
