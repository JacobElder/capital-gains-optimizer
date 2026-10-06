import { useState, useRef } from 'react'
import { format } from 'date-fns'
import { useAppStore } from '../../store/useAppStore'
import { lookupTickerName } from '../../data/tickerNames'
import { formatCurrency } from '../../lib/taxEngine'
import type { FutureVestLot } from '../../types'

interface Props {
  onClose: () => void
}

interface ParsedRow {
  ticker: string
  name: string
  shares: number
  costBasisPerShare: number
  purchaseDate: string
  currentPrice: number
  priceNote?: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseDate(raw: string): string {
  if (!raw) return ''
  const clean = raw.replace(/"/g, '').trim()
  // YYYY-MM-DD already
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean
  // MM/DD/YYYY or M/D/YYYY
  const slash = clean.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
  if (slash) {
    const yr = slash[3].length === 2 ? `20${slash[3]}` : slash[3]
    return `${yr}-${slash[1].padStart(2, '0')}-${slash[2].padStart(2, '0')}`
  }
  // MM-DD-YYYY (Schwab EAC format: "06-25-2025")
  const dash = clean.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/)
  if (dash) return `${dash[3]}-${dash[1].padStart(2, '0')}-${dash[2].padStart(2, '0')}`
  return clean
}

function cleanNumber(raw: string): number {
  return parseFloat(raw.replace(/[$,%"'\s]/g, '').replace(/,/g, ''))
}

function splitCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') { inQuotes = !inQuotes; continue }
    if ((ch === ',' || ch === '\t') && !inQuotes) {
      result.push(current.trim())
      current = ''
    } else {
      current += ch
    }
  }
  result.push(current.trim())
  return result
}

// ── Schwab EAC format detector & parser ──────────────────────────────────────

function isEACFormat(text: string): boolean {
  return text.includes('EQUITY AWARD SHARES') ||
    text.includes('Equity Details for Equity Awards Center') ||
    text.includes('RESTRICTED STOCK UNITS')
}

function parseEACText(text: string): { rows: ParsedRow[]; errors: string[] } {
  const errors: string[] = []
  const rows: ParsedRow[] = []

  // Find the EQUITY AWARD SHARES section
  const sectionIdx = text.indexOf('*** EQUITY AWARD SHARES ***')
  if (sectionIdx < 0) {
    errors.push('Could not find the "EQUITY AWARD SHARES" section. This file only shows unvested grants — export the full Equity Details file which includes your current holdings at the bottom.')
    return { rows, errors }
  }

  const sectionText = text.slice(sectionIdx)
  const lines = sectionText.split('\n').map(l => l.trim()).filter(Boolean)

  // Find the header row (contains "Date Acquired" and "Symbol")
  let headerIdx = -1
  for (let i = 0; i < lines.length; i++) {
    const lower = lines[i].toLowerCase()
    if (lower.includes('date acquired') && lower.includes('symbol')) {
      headerIdx = i
      break
    }
  }

  if (headerIdx < 0) {
    errors.push('Could not find the column header row in EQUITY AWARD SHARES section.')
    return { rows, errors }
  }

  const headers = splitCSVLine(lines[headerIdx])
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

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i]
    if (line.startsWith('Totals') || line.startsWith('Please exercise')) break

    const cells = splitCSVLine(line)
    if (cells.length < 5) continue

    const ticker = cells[colSymbol]?.toUpperCase().trim()
    if (!ticker || ticker === '--' || ticker === '') continue

    const dateRaw = cells[colDateAcquired] ?? ''
    const priceRaw = cells[colAcquisitionPrice] ?? ''
    const sharesRaw = colShares >= 0 ? (cells[colShares] ?? '') : ''
    const availableRaw = colAvailable >= 0 ? (cells[colAvailable] ?? '') : ''
    const mvRaw = colMarketValue >= 0 ? (cells[colMarketValue] ?? '') : ''

    const purchaseDate = parseDate(dateRaw)
    const acquisitionPrice = cleanNumber(priceRaw)
    const totalShares = cleanNumber(sharesRaw)
    const availableToSell = cleanNumber(availableRaw)
    const marketValue = cleanNumber(mvRaw)

    if (!purchaseDate) { errors.push(`Skipped row ${i}: invalid date "${dateRaw}"`); continue }
    if (isNaN(acquisitionPrice) || acquisitionPrice <= 0) { errors.push(`Skipped row ${i}: invalid acquisition price "${priceRaw}"`); continue }

    // Use "Available to Sell" for how many shares the user still holds
    const shares = !isNaN(availableToSell) && availableToSell > 0
      ? availableToSell
      : !isNaN(totalShares) && totalShares > 0 ? totalShares : NaN

    if (isNaN(shares) || shares <= 0) continue // nothing available to sell

    // Market Value in the EAC = Available to Sell × current price (Schwab withholds
    // shares for taxes at vest, so "Shares" > "Available to Sell" in each lot).
    let currentPrice = NaN
    if (!isNaN(marketValue) && marketValue > 0 && !isNaN(availableToSell) && availableToSell > 0) {
      currentPrice = marketValue / availableToSell
    }

    if (isNaN(currentPrice) || currentPrice <= 0) {
      errors.push(`Skipped row ${i} (${ticker}): cannot compute current price — Market Value missing`)
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

// ── Generic columnar CSV parser ───────────────────────────────────────────────

function detectColumns(headers: string[]): {
  ticker: number; shares: number; date: number;
  costBasis: number; currentPrice: number; name: number;
  costBasisIsTotal: boolean; currentPriceIsTotal: boolean;
} | null {
  const h = headers.map(s => s.toLowerCase().replace(/[^a-z0-9]/g, ' ').trim())

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
  const date = find('date acquired', 'vest date', 'acquired', 'purchase date', 'vesting date', 'vest')
  const costBasisPerShare = find('costbasispershare', 'cost basis per share', 'fmv at vest', 'acquisition price per share', 'acquisition price', 'grant price', 'cost per share', 'price paid', 'award price')
  const costBasisTotal = costBasisPerShare >= 0 ? -1 : find('adjusted cost', 'cost basis', 'total cost', 'acquisition value')
  const currentPerShare = find('currentpricepershare', 'current price', 'market price', 'last price', 'price')
  const currentTotal = currentPerShare >= 0 ? -1 : find('market value', 'current value', 'total value', 'value')
  const name = find('description', 'company', 'name', 'security')

  const costBasis = costBasisPerShare >= 0 ? costBasisPerShare : costBasisTotal
  const costBasisIsTotal = costBasisPerShare < 0 && costBasisTotal >= 0
  const currentPrice = currentPerShare >= 0 ? currentPerShare : currentTotal
  const currentPriceIsTotal = currentPerShare < 0 && currentTotal >= 0

  if (ticker < 0 || shares < 0 || date < 0 || costBasis < 0 || currentPrice < 0) return null
  return { ticker, shares, date, costBasis, currentPrice, name, costBasisIsTotal, currentPriceIsTotal }
}

export function parseGenericCSV(text: string): { rows: ParsedRow[]; errors: string[] } {
  const errors: string[] = []
  const rows: ParsedRow[] = []

  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  if (lines.length < 2) {
    errors.push('Need at least a header row and one data row.')
    return { rows, errors }
  }

  const headers = splitCSVLine(lines[0])
  const cols = detectColumns(headers)

  if (!cols) {
    errors.push('Could not detect required columns. Need: Symbol/Ticker, Shares, Date, Cost Basis, and Current Price/Market Value.')
    errors.push(`Found headers: ${headers.join(', ')}`)
    return { rows, errors }
  }

  for (let i = 1; i < lines.length; i++) {
    const cells = splitCSVLine(lines[i])
    if (cells.length < 3) continue

    const ticker = (cells[cols.ticker] ?? '').toUpperCase().trim()
    if (!ticker) continue

    const sharesRaw = cleanNumber(cells[cols.shares] ?? '')
    const dateRaw = parseDate(cells[cols.date] ?? '')
    const costRaw = cleanNumber(cells[cols.costBasis] ?? '')
    const priceRaw = cleanNumber(cells[cols.currentPrice] ?? '')
    const nameRaw = cols.name >= 0 ? (cells[cols.name] ?? '').replace(/"/g, '').trim() : ''

    if (isNaN(sharesRaw) || sharesRaw <= 0) { errors.push(`Row ${i}: invalid shares "${cells[cols.shares]}"`); continue }
    if (isNaN(costRaw) || costRaw < 0) { errors.push(`Row ${i}: invalid cost basis "${cells[cols.costBasis]}"`); continue }
    if (isNaN(priceRaw) || priceRaw <= 0) { errors.push(`Row ${i}: invalid price "${cells[cols.currentPrice]}"`); continue }
    if (!dateRaw) { errors.push(`Row ${i}: invalid date "${cells[cols.date]}"`); continue }

    rows.push({
      ticker,
      name: nameRaw || lookupTickerName(ticker) || ticker,
      shares: sharesRaw,
      costBasisPerShare: cols.costBasisIsTotal ? costRaw / sharesRaw : costRaw,
      purchaseDate: dateRaw,
      currentPrice: cols.currentPriceIsTotal ? priceRaw / sharesRaw : priceRaw,
    })
  }

  return { rows, errors }
}

// ── RSU Future Vest parser ────────────────────────────────────────────────────

function parseEACFutureVests(text: string): FutureVestLot[] {
  const today = format(new Date(), 'yyyy-MM-dd') // vests on or before today are already holdings
  const rsuIdx = text.indexOf('*** RESTRICTED STOCK UNITS ***')
  if (rsuIdx < 0) return []

  const rsuSection = text.slice(rsuIdx)
  const lines = rsuSection.split('\n')

  const result: FutureVestLot[] = []
  let currentTicker = ''
  let currentAwardId = ''
  let currentAwardDate = ''

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]
    const line = raw.trim()

    // Stop at next major section
    if (line.startsWith('***') && !line.includes('RESTRICTED STOCK UNITS')) break

    // Detect ticker from award header row — look for "Symbol" column
    // Award header lines typically have: Symbol, Award Date, Award ID, ...
    if (line.toLowerCase().includes('symbol') && line.toLowerCase().includes('award date')) {
      // Next non-empty line may have the ticker, or it could be on the same line after headers
      // Try the following line(s) for the actual values
      const nextLine = (lines[i + 1] ?? '').trim()
      if (nextLine && !nextLine.toLowerCase().includes('symbol')) {
        const cells = splitCSVLine(nextLine)
        if (cells[0] && /^[A-Z]{1,5}$/.test(cells[0].toUpperCase().trim())) {
          currentTicker = cells[0].toUpperCase().trim()
          const awardDateRaw = cells[1] ?? ''
          currentAwardDate = parseDate(awardDateRaw)
          i++ // consume
        }
      }
      continue
    }

    // Detect ticker from a line that looks like: GOOG,"Alphabet Inc.",...
    // (simple award block header - Symbol is first column, typically all-caps)
    const tickerMatch = line.match(/^([A-Z]{1,5}),/)
    if (tickerMatch) {
      currentTicker = tickerMatch[1]
      const cells = splitCSVLine(line)
      const awardDateRaw = cells[1] ?? ''
      if (awardDateRaw) currentAwardDate = parseDate(awardDateRaw)
      continue
    }

    // Award ID row: "Award ID,XXXXXXX" or ",Award ID,XXXXXXX"
    const awardIdMatch = line.match(/Award ID[,\s]+([A-Z0-9\-]+)/i)
    if (awardIdMatch) {
      currentAwardId = awardIdMatch[1].replace(/"/g, '').trim()
      continue
    }

    // Vest schedule row: ,"MM-DD-YYYY","NN" or similar
    // These are indented (start with comma) with date and share count
    const vestMatch = raw.match(/^\s*,\s*"?(\d{2}-\d{2}-\d{4})"?\s*,\s*"?(\d+)"?/)
    if (vestMatch && currentTicker) {
      const vestDate = parseDate(vestMatch[1])
      const sharesGross = parseInt(vestMatch[2], 10)
      if (vestDate && vestDate > today && !isNaN(sharesGross) && sharesGross > 0) {
        result.push({
          id: crypto.randomUUID(),
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

function parseText(text: string): { rows: ParsedRow[]; errors: string[] } {
  if (isEACFormat(text)) return parseEACText(text)
  return parseGenericCSV(text)
}

// ── Template CSV ──────────────────────────────────────────────────────────────

export const TEMPLATE_CSV = `Symbol,Shares,VestDate,CostBasisPerShare,CurrentPricePerShare,CompanyName
AAPL,25,2025-11-03,210.00,232.50,Apple Inc.
MSFT,10.5,2024-09-16,415.20,440.00,Microsoft Corporation
`

function downloadTemplate() {
  const blob = new Blob([TEMPLATE_CSV], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'positions-template.csv'
  a.click()
  URL.revokeObjectURL(url)
}

// ── Main modal ────────────────────────────────────────────────────────────────

export default function SchwabImportModal({ onClose }: Props) {
  const { addPosition, setFutureVests } = useAppStore()
  const [tab, setTab] = useState<'paste' | 'file'>('paste')
  const [rawText, setRawText] = useState('')
  const [parsed, setParsed] = useState<{ rows: ParsedRow[]; errors: string[] } | null>(null)
  const [imported, setImported] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  function handleParse() {
    setParsed(parseText(rawText))
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      setRawText(text)
      setParsed(parseText(text))
    }
    reader.readAsText(file)
  }

  function handleImport() {
    if (!parsed) return
    for (const row of parsed.rows) {
      addPosition({
        ticker: row.ticker,
        name: row.name,
        shares: row.shares,
        costBasisPerShare: row.costBasisPerShare,
        purchaseDate: row.purchaseDate,
        currentPrice: row.currentPrice,
      })
    }
    // Parse and store future vests if this is an EAC file
    if (isEACFormat(rawText)) {
      const futureVests = parseEACFutureVests(rawText)
      if (futureVests.length > 0) {
        setFutureVests(futureVests)
      }
    }
    setImported(true)
  }

  const isEAC = parsed != null && rawText && isEACFormat(rawText)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700 flex-shrink-0">
          <div>
            <h2 className="text-lg font-bold text-white">Import Positions</h2>
            <p className="text-xs text-slate-400 mt-0.5">Schwab EAC export, CSV, or pasted spreadsheet data</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xl leading-none">×</button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
          {imported ? (
            <div className="text-center py-10 space-y-3">
              <div className="text-4xl">✅</div>
              <div className="text-white font-bold text-lg">{parsed?.rows.length} position{parsed?.rows.length !== 1 ? 's' : ''} imported</div>
              {isEAC && (
                <p className="text-xs text-amber-400/80 max-w-sm mx-auto">
                  Current prices came from the EAC file at export time — update each position's price if the market has moved since then.
                </p>
              )}
              <button
                onClick={onClose}
                className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-6 py-2.5 rounded-lg transition-colors"
              >
                Done
              </button>
            </div>
          ) : (
            <>
              {/* Instructions */}
              <div className="bg-indigo-950/40 border border-indigo-900/50 rounded-xl p-4 text-xs space-y-3">
                <div className="text-indigo-300 font-semibold">How to get your Schwab data</div>
                <div className="space-y-2 text-slate-400 leading-relaxed">
                  <p>
                    <span className="text-green-400 font-semibold">Best — Schwab EAC "Equity Details" export:</span><br />
                    In Schwab's Equity Awards Center, look for a <strong className="text-slate-300">Download</strong> or <strong className="text-slate-300">Export</strong> button.
                    The file will be named something like <span className="font-mono text-slate-300">EquityDetails.csv</span>.
                    Upload it below — the parser recognises it automatically and reads each vested lot with its cost basis and date.
                  </p>
                  <p>
                    <span className="text-indigo-400 font-medium">Alternative — paste the file contents:</span><br />
                    Open the downloaded file, select all (Ctrl+A / Cmd+A), copy, and paste into the text area below.
                  </p>
                  <p>
                    <span className="text-slate-500 font-medium">Manual — fill our template:</span><br />
                    Download the template and enter your lot data from the EAC screen.
                  </p>
                </div>
                <div className="bg-slate-800/60 rounded-lg p-2.5 text-slate-400 text-xs">
                  <span className="text-amber-400 font-medium">Note:</span> Current price is estimated from the EAC Market Value ÷ Shares at export time.
                  Update it in each position card after import if the stock has moved.
                </div>
              </div>

              {/* Template download */}
              <button
                onClick={downloadTemplate}
                className="w-full flex items-center justify-center gap-2 border border-slate-600 hover:border-slate-500 text-slate-300 hover:text-white text-sm py-2.5 rounded-lg transition-colors"
              >
                <span>⬇️</span> Download CSV Template
              </button>

              {/* Input method tabs */}
              <div className="flex gap-1 bg-slate-700/40 rounded-lg p-0.5 w-fit">
                <TabBtn active={tab === 'paste'} onClick={() => setTab('paste')}>Paste data</TabBtn>
                <TabBtn active={tab === 'file'} onClick={() => setTab('file')}>Upload file</TabBtn>
              </div>

              {tab === 'paste' && (
                <div>
                  <textarea
                    value={rawText}
                    onChange={e => { setRawText(e.target.value); setParsed(null) }}
                    placeholder={`Paste the Schwab EAC export file contents here, or any CSV with headers.\n\nThe EAC file format is detected automatically — just paste the whole thing.`}
                    className="w-full h-36 bg-slate-700 border border-slate-600 text-white text-xs font-mono rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y"
                  />
                  <button
                    onClick={handleParse}
                    disabled={!rawText.trim()}
                    className="mt-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-40 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
                  >
                    Preview Import
                  </button>
                </div>
              )}

              {tab === 'file' && (
                <div
                  onClick={() => fileRef.current?.click()}
                  className="border-2 border-dashed border-slate-600 hover:border-indigo-500 rounded-xl p-8 text-center cursor-pointer transition-colors"
                >
                  <div className="text-3xl mb-2">📄</div>
                  <div className="text-slate-300 text-sm font-medium">Click to upload file</div>
                  <div className="text-slate-500 text-xs mt-1">Schwab EAC export, CSV, or TSV</div>
                  <input ref={fileRef} type="file" accept=".csv,.tsv,.txt" onChange={handleFile} className="hidden" />
                </div>
              )}

              {/* EAC detected banner */}
              {parsed && isEAC && (
                <div className="bg-green-950/40 border border-green-800/40 rounded-lg px-3 py-2 text-xs text-green-300 flex items-center gap-2">
                  <span>✓</span> Schwab EAC format detected — reading "EQUITY AWARD SHARES" section
                </div>
              )}

              {/* Parse errors */}
              {parsed?.errors.length ? (
                <div className="bg-red-950/50 border border-red-800/50 rounded-lg p-3 space-y-1">
                  <div className="text-red-300 text-xs font-semibold">Parse warnings</div>
                  {parsed.errors.map((e, i) => (
                    <div key={i} className="text-red-400/80 text-xs font-mono">{e}</div>
                  ))}
                </div>
              ) : null}

              {/* Preview table */}
              {parsed && parsed.rows.length > 0 && (
                <div>
                  <div className="text-xs text-slate-400 font-semibold mb-2">
                    Preview — {parsed.rows.length} lot{parsed.rows.length !== 1 ? 's' : ''} to import
                    {isEAC && <span className="ml-2 text-slate-500 font-normal">(shares = "Available to Sell")</span>}
                  </div>
                  <div className="overflow-x-auto rounded-lg border border-slate-700">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-slate-700/50 text-slate-400">
                          <th className="text-left px-3 py-2">Ticker</th>
                          <th className="text-right px-3 py-2">Shares</th>
                          <th className="text-right px-3 py-2">Cost Basis/sh</th>
                          <th className="text-left px-3 py-2">Vest Date</th>
                          <th className="text-right px-3 py-2">~Price/sh</th>
                          <th className="text-right px-3 py-2">Gain</th>
                        </tr>
                      </thead>
                      <tbody>
                        {parsed.rows.map((row, i) => {
                          const gain = (row.currentPrice - row.costBasisPerShare) * row.shares
                          return (
                            <tr key={i} className="border-t border-slate-700/50 hover:bg-slate-700/20">
                              <td className="px-3 py-2 font-bold text-white">{row.ticker}</td>
                              <td className="px-3 py-2 text-right font-mono">{row.shares.toFixed(3)}</td>
                              <td className="px-3 py-2 text-right font-mono">{formatCurrency(row.costBasisPerShare, 2)}</td>
                              <td className="px-3 py-2 font-mono">{row.purchaseDate}</td>
                              <td className="px-3 py-2 text-right font-mono text-amber-300/80">
                                {formatCurrency(row.currentPrice, 2)}
                              </td>
                              <td className={`px-3 py-2 text-right font-mono font-semibold ${gain >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                {gain >= 0 ? '+' : ''}{formatCurrency(gain)}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>

                  <button
                    onClick={handleImport}
                    className="mt-3 w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-2.5 rounded-lg transition-colors"
                  >
                    Import {parsed.rows.length} Position{parsed.rows.length !== 1 ? 's' : ''}
                  </button>
                </div>
              )}

              {parsed && parsed.rows.length === 0 && !parsed.errors.length && (
                <div className="text-center text-slate-500 text-sm py-4">No valid rows found. Check the column headers.</div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors ${
        active ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-slate-200'
      }`}
    >
      {children}
    </button>
  )
}
