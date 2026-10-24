import { format } from 'date-fns'
import { lookupTickerName } from '../data/tickerNames'
import type { FutureVestLot, Position } from '../types'

// Parsing for the import modal: Schwab Equity Awards Center exports and any
// columnar CSV/TSV (Schwab Positions export, spreadsheets, the template).
// Pure functions: `today` is passed in so tests do not depend on the clock.

export interface ParsedRow {
  ticker: string
  name: string
  shares: number
  costBasisPerShare: number
  purchaseDate: string
  currentPrice: number
  priceNote?: string
}

export interface ParseResult {
  rows: ParsedRow[]
  errors: string[]
}

const todayIso = () => format(new Date(), 'yyyy-MM-dd')

// ── Cells ─────────────────────────────────────────────────────────────────────

function isRealDate(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1) return false
  return d <= new Date(Date.UTC(y, m, 0)).getUTCDate() // day 0 of next month = last day of this one
}

/**
 * Normalizes a date cell to YYYY-MM-DD, or '' when it is not a real calendar
 * date. Accepts YYYY-MM-DD, M/D/YYYY, M/D/YY and MM-DD-YYYY (Schwab EAC).
 * Two-digit years up to this year's are 20xx, later ones 19xx.
 */
export function parseDate(raw: string, today: string = todayIso()): string {
  const clean = (raw ?? '').replace(/"/g, '').trim()
  let y: number, m: number, d: number
  let match: RegExpMatchArray | null
  if ((match = clean.match(/^(\d{4})-(\d{2})-(\d{2})$/))) {
    ;[y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])]
  } else if ((match = clean.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/))) {
    ;[m, d, y] = [Number(match[1]), Number(match[2]), Number(match[3])]
    if (match[3].length === 2) {
      const thisYear = Number(today.slice(2, 4))
      y += y <= thisYear ? 2000 : 1900
    }
  } else if ((match = clean.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/))) {
    ;[m, d, y] = [Number(match[1]), Number(match[2]), Number(match[3])]
  } else {
    return ''
  }
  if (!isRealDate(y, m, d)) return ''
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/**
 * Parses a money/number cell: "$1,234.56", "12.5%", "(123.45)" → -123.45.
 * Anything else ("--", "N/A", "12abc") is NaN.
 */
export function cleanNumber(raw: string): number {
  let s = (raw ?? '').replace(/["'$,%\s]/g, '')
  let sign = 1
  const paren = s.match(/^\((.*)\)$/)
  if (paren) { sign = -1; s = paren[1] }
  if (!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(s)) return NaN
  return sign * parseFloat(s)
}

/** Tab when the line has a tab (spreadsheet paste), comma otherwise. */
export function detectDelimiter(line: string): ',' | '\t' {
  return line.includes('\t') ? '\t' : ','
}

/** Splits one CSV line, honoring quotes and "" escapes inside quotes. */
export function splitCSVLine(line: string, delimiter: ',' | '\t' = ','): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++ }
      else inQuotes = !inQuotes
      continue
    }
    if (ch === delimiter && !inQuotes) {
      result.push(current.trim())
      current = ''
    } else {
      current += ch
    }
  }
  result.push(current.trim())
  return result
}

/** Plausible ticker: letters first, then letters/digits/./-/ (BRK.B, BF-B). Rejects "Account Total". */
export function isTicker(s: string): boolean {
  return /^[A-Z][A-Z0-9./-]{0,9}$/.test(s)
}

// ── Schwab Equity Awards Center ───────────────────────────────────────────────

const EAC_SHARES = '*** EQUITY AWARD SHARES ***'
const EAC_RSUS = '*** RESTRICTED STOCK UNITS ***'

export function isEACFormat(text: string): boolean {
  return text.includes(EAC_SHARES) || text.includes(EAC_RSUS) ||
    text.includes('Equity Details for Equity Awards Center')
}

/** File lines with their 1-based line numbers, trimmed, blanks dropped. */
function numberedLines(text: string, fromIndex = 0): Array<{ n: number; line: string }> {
  const before = text.slice(0, fromIndex).split('\n').length - 1
  return text.slice(fromIndex).split('\n')
    .map((line, i) => ({ n: before + i + 1, line: line.replace(/^﻿/, '').trim() }))
    .filter(l => l.line)
}

export function parseEACText(text: string, today: string = todayIso()): ParseResult {
  const errors: string[] = []
  const rows: ParsedRow[] = []

  const sectionIdx = text.indexOf(EAC_SHARES)
  if (sectionIdx < 0) {
    errors.push('Could not find the "EQUITY AWARD SHARES" section. This file only shows unvested grants — export the full Equity Details file which includes your current holdings at the bottom.')
    return { rows, errors }
  }
  const lines = numberedLines(text, sectionIdx)

  const headerIdx = lines.findIndex(({ line }) => {
    const lower = line.toLowerCase()
    return lower.includes('date acquired') && lower.includes('symbol')
  })
  if (headerIdx < 0) {
    errors.push('Could not find the column header row in EQUITY AWARD SHARES section.')
    return { rows, errors }
  }

  const delim = detectDelimiter(lines[headerIdx].line)
  const headers = splitCSVLine(lines[headerIdx].line, delim)
  const h = headers.map(s => s.toLowerCase().replace(/[^a-z0-9]/g, ' ').trim())
  const colSymbol = h.findIndex(c => c === 'symbol')
  const colDateAcquired = h.findIndex(c => c.includes('date acquired'))
  const colAcquisitionPrice = h.findIndex(c => c.includes('acquisition price'))
  const colShares = h.findIndex(c => c === 'shares')
  const colAvailable = h.findIndex(c => c.includes('available'))
  const colMarketValue = h.findIndex(c => c === 'market value')

  if (colSymbol < 0 || colDateAcquired < 0 || colAcquisitionPrice < 0) {
    errors.push(`Missing required columns. Found: ${headers.join(', ')}`)
    return { rows, errors }
  }

  for (const { n, line } of lines.slice(headerIdx + 1)) {
    if (line.startsWith('Totals') || line.startsWith('Please exercise') || line.startsWith('***')) break

    const cells = splitCSVLine(line, delim)
    if (cells.length < 5) continue

    const ticker = (cells[colSymbol] ?? '').toUpperCase().trim()
    if (!isTicker(ticker)) continue

    const dateRaw = cells[colDateAcquired] ?? ''
    const priceRaw = cells[colAcquisitionPrice] ?? ''
    const purchaseDate = parseDate(dateRaw, today)
    const acquisitionPrice = cleanNumber(priceRaw)
    const totalShares = colShares >= 0 ? cleanNumber(cells[colShares] ?? '') : NaN
    const availableToSell = colAvailable >= 0 ? cleanNumber(cells[colAvailable] ?? '') : NaN
    const marketValue = colMarketValue >= 0 ? cleanNumber(cells[colMarketValue] ?? '') : NaN

    if (!purchaseDate) { errors.push(`Skipped line ${n}: invalid date "${dateRaw}"`); continue }
    if (purchaseDate > today) { errors.push(`Skipped line ${n}: date ${purchaseDate} is in the future`); continue }
    if (!(acquisitionPrice > 0)) { errors.push(`Skipped line ${n}: invalid acquisition price "${priceRaw}"`); continue }

    // "Available to Sell" is what the user still holds ("Shares" includes
    // sell-to-cover); "Shares" is only a fallback when that column is missing
    const shares = Number.isFinite(availableToSell) ? availableToSell : totalShares
    if (!(shares > 0)) continue // nothing left to sell

    // Market Value in the EAC = Available to Sell × current price
    const currentPrice = marketValue > 0 && availableToSell > 0 ? marketValue / availableToSell : NaN
    if (!(currentPrice > 0)) {
      errors.push(`Skipped line ${n} (${ticker}): cannot compute current price — Market Value missing`)
      continue
    }

    rows.push({
      ticker,
      name: lookupTickerName(ticker) || ticker,
      shares,
      costBasisPerShare: acquisitionPrice,
      purchaseDate,
      currentPrice,
      priceNote: 'price from EAC export',
    })
  }

  return { rows, errors }
}

/**
 * Future RSU vests from the EAC "RESTRICTED STOCK UNITS" section. Vests on or
 * before `today` are skipped: they already show up as holdings.
 */
export function parseEACFutureVests(
  text: string, today: string = todayIso(), genId: () => string = () => crypto.randomUUID(),
): FutureVestLot[] {
  const rsuIdx = text.indexOf(EAC_RSUS)
  if (rsuIdx < 0) return []
  const lines = text.slice(rsuIdx).split('\n')

  const result: FutureVestLot[] = []
  let currentTicker = ''
  let currentAwardId = ''
  let currentAwardDate = ''

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]
    const line = raw.trim()

    if (line.startsWith('***') && !line.includes('RESTRICTED STOCK UNITS')) break

    // Award header row ("Symbol, Award Date, ...") followed by its values
    if (line.toLowerCase().includes('symbol') && line.toLowerCase().includes('award date')) {
      const nextLine = (lines[i + 1] ?? '').trim()
      if (nextLine && !nextLine.toLowerCase().includes('symbol')) {
        const cells = splitCSVLine(nextLine)
        const t = (cells[0] ?? '').toUpperCase().trim()
        if (/^[A-Z]{1,5}$/.test(t)) {
          currentTicker = t
          currentAwardDate = parseDate(cells[1] ?? '', today)
          i++
        }
      }
      continue
    }

    // Award block header: GOOG,"MM-DD-YYYY",...
    const tickerMatch = line.match(/^([A-Z]{1,5}),/)
    if (tickerMatch) {
      currentTicker = tickerMatch[1]
      const cells = splitCSVLine(line)
      if (cells[1]) currentAwardDate = parseDate(cells[1], today)
      continue
    }

    const awardIdMatch = line.match(/Award ID[,\s]+"?([A-Z0-9-]+)/i)
    if (awardIdMatch) {
      currentAwardId = awardIdMatch[1]
      continue
    }

    // Vest schedule row: ,"MM-DD-YYYY","1,250"
    if (raw.trimStart().startsWith(',') && currentTicker) {
      const cells = splitCSVLine(line)
      const vestDate = parseDate(cells[1] ?? '', today)
      const sharesGross = cleanNumber(cells[2] ?? '')
      if (vestDate && vestDate > today && sharesGross > 0) {
        result.push({
          id: genId(),
          ticker: currentTicker,
          name: lookupTickerName(currentTicker) || currentTicker,
          awardId: currentAwardId,
          awardDate: currentAwardDate,
          vestDate,
          sharesGross,
        })
      }
    }
  }

  return result
}

// ── Generic columnar CSV ──────────────────────────────────────────────────────

export interface ColumnMap {
  ticker: number; shares: number; date: number
  costBasis: number; currentPrice: number; name: number
  costBasisIsTotal: boolean; currentPriceIsTotal: boolean
}

export function detectColumns(headers: string[]): ColumnMap | null {
  const h = headers.map(s => s.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim())

  // Each column can be claimed once, and terms are tried in priority order, so
  // e.g. "Acquisition Price" is never mistaken for the current price.
  const used = new Set<number>()
  const find = (...terms: string[]) => {
    for (const exact of [true, false]) {
      for (const t of terms) {
        const idx = h.findIndex((col, i) => !used.has(i) && (exact ? col === t : col.includes(t)))
        if (idx >= 0) { used.add(idx); return idx }
      }
    }
    return -1
  }

  const ticker = find('symbol', 'ticker')
  const shares = find('available to sell', 'shares vested', 'qty', 'quantity', 'shares', 'available')
  const date = find('date acquired', 'vest date', 'vestdate', 'acquired', 'purchase date', 'vesting date', 'vest', 'date')
  const costBasisPerShare = find('costbasispershare', 'cost basis per share', 'fmv at vest', 'acquisition price per share', 'acquisition price', 'grant price', 'cost per share', 'price paid', 'award price')
  const costBasisTotal = costBasisPerShare >= 0 ? -1 : find('adjusted cost', 'cost basis', 'total cost', 'acquisition value')
  const currentPerShare = find('currentpricepershare', 'current price', 'market price', 'last price', 'price')
  const currentTotal = currentPerShare >= 0 ? -1 : find('market value', 'mkt val', 'current value', 'total value', 'value')
  const name = find('description', 'company', 'companyname', 'name', 'security')

  const costBasis = costBasisPerShare >= 0 ? costBasisPerShare : costBasisTotal
  const currentPrice = currentPerShare >= 0 ? currentPerShare : currentTotal
  if (ticker < 0 || shares < 0 || date < 0 || costBasis < 0 || currentPrice < 0) return null
  return {
    ticker, shares, date, costBasis, currentPrice, name,
    costBasisIsTotal: costBasisPerShare < 0,
    currentPriceIsTotal: currentPerShare < 0,
  }
}

const HEADER_SEARCH_LINES = 10 // Schwab exports put an account/date preamble above the header

export function parseGenericCSV(text: string, today: string = todayIso()): ParseResult {
  const errors: string[] = []
  const rows: ParsedRow[] = []

  const lines = numberedLines(text)
  if (lines.length < 2) {
    errors.push('Need at least a header row and one data row.')
    return { rows, errors }
  }

  let headerIdx = -1
  let cols: ColumnMap | null = null
  let delim: ',' | '\t' = ','
  for (let i = 0; i < Math.min(lines.length, HEADER_SEARCH_LINES); i++) {
    const d = detectDelimiter(lines[i].line)
    const c = detectColumns(splitCSVLine(lines[i].line, d))
    if (c) { headerIdx = i; cols = c; delim = d; break }
  }
  if (!cols) {
    errors.push('Could not detect required columns. Need: Symbol/Ticker, Shares, Date, Cost Basis, and Current Price/Market Value.')
    errors.push(`Found headers: ${splitCSVLine(lines[0].line, detectDelimiter(lines[0].line)).join(', ')}`)
    return { rows, errors }
  }
  const headerLine = lines[headerIdx].line

  for (const { n, line } of lines.slice(headerIdx + 1)) {
    if (line === headerLine) continue // repeated header of another account block
    const cells = splitCSVLine(line, delim)
    if (cells.length < 3) continue

    // Skips footers ("Account Total", "Cash & Cash Investments") and preamble lines
    const ticker = (cells[cols.ticker] ?? '').toUpperCase().trim()
    if (!isTicker(ticker)) continue

    const shares = cleanNumber(cells[cols.shares] ?? '')
    const purchaseDate = parseDate(cells[cols.date] ?? '', today)
    const cost = cleanNumber(cells[cols.costBasis] ?? '')
    const price = cleanNumber(cells[cols.currentPrice] ?? '')
    const name = cols.name >= 0 ? (cells[cols.name] ?? '').trim() : ''

    if (!(shares > 0)) { errors.push(`Line ${n}: invalid shares "${cells[cols.shares] ?? ''}"`); continue }
    if (!(cost >= 0)) { errors.push(`Line ${n}: invalid cost basis "${cells[cols.costBasis] ?? ''}"`); continue }
    if (!(price > 0)) { errors.push(`Line ${n}: invalid price "${cells[cols.currentPrice] ?? ''}"`); continue }
    if (!purchaseDate) { errors.push(`Line ${n}: invalid date "${cells[cols.date] ?? ''}"`); continue }
    if (purchaseDate > today) { errors.push(`Line ${n}: date ${purchaseDate} is in the future`); continue }

    rows.push({
      ticker,
      name: name || lookupTickerName(ticker) || ticker,
      shares,
      costBasisPerShare: cols.costBasisIsTotal ? cost / shares : cost,
      purchaseDate,
      currentPrice: cols.currentPriceIsTotal ? price / shares : price,
    })
  }

  return { rows, errors }
}

export function parseText(text: string, today: string = todayIso()): ParseResult {
  return isEACFormat(text) ? parseEACText(text, today) : parseGenericCSV(text, today)
}

// ── Duplicates ────────────────────────────────────────────────────────────────

type LotLike = Pick<Position, 'ticker' | 'purchaseDate' | 'shares' | 'costBasisPerShare'>
const lotKey = (l: LotLike) =>
  `${l.ticker}|${l.purchaseDate}|${Math.round(l.shares * 1e6)}|${Math.round(l.costBasisPerShare * 100)}`

/**
 * Drops rows that repeat a lot already in the portfolio or earlier in the same
 * file (same ticker, date, shares and cost basis), so re-importing a file does
 * not double every position.
 */
export function dedupeRows(rows: ParsedRow[], existing: LotLike[]): { rows: ParsedRow[]; duplicates: number } {
  const seen = new Set(existing.map(lotKey))
  const fresh: ParsedRow[] = []
  for (const r of rows) {
    const k = lotKey(r)
    if (seen.has(k)) continue
    seen.add(k)
    fresh.push(r)
  }
  return { rows: fresh, duplicates: rows.length - fresh.length }
}

// ── Template ──────────────────────────────────────────────────────────────────

export const TEMPLATE_CSV = `Symbol,Shares,VestDate,CostBasisPerShare,CurrentPricePerShare,CompanyName
AAPL,25,2025-11-03,210.00,232.50,Apple Inc.
MSFT,10.5,2024-09-16,415.20,440.00,Microsoft Corporation
`
