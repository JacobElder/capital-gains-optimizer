import { useState, useRef } from 'react'
import { useAppStore } from '../../store/useAppStore'
import { formatCurrency } from '../../lib/taxEngine'
import {
  TEMPLATE_CSV, dedupeRows, isEACFormat, parseEACFutureVests, parseText, type ParseResult,
} from '../../lib/csvImport'

interface Props {
  onClose: () => void
}

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
  const existingPositions = useAppStore(s => s.positions)
  const [tab, setTab] = useState<'paste' | 'file'>('paste')
  const [rawText, setRawText] = useState('')
  const [parsed, setParsed] = useState<ParseResult | null>(null)
  const [imported, setImported] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // Parse, then drop lots already in the portfolio (or repeated in the file)
  function parseAndDedupe(text: string): ParseResult {
    const result = parseText(text)
    const { rows, duplicates } = dedupeRows(result.rows, existingPositions)
    const errors = duplicates > 0
      ? [...result.errors, `Skipped ${duplicates} duplicate lot${duplicates !== 1 ? 's' : ''} already in your portfolio or repeated in this file.`]
      : result.errors
    return { rows, errors }
  }

  function handleParse() {
    setParsed(parseAndDedupe(rawText))
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      setRawText(text)
      setParsed(parseAndDedupe(text))
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
