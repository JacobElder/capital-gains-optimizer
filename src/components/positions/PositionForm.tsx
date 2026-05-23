import { useState, useEffect } from 'react'
import { useAppStore } from '../../store/useAppStore'
import { formatCurrency } from '../../lib/taxEngine'
import { lookupTickerName } from '../../data/tickerNames'
import { getTickerVol, isVolKnown, DEFAULT_VOL } from '../../data/tickerVolatility'
import type { Position } from '../../types'

interface Props {
  editingPosition?: Position
  onClose: () => void
}

interface FormState {
  ticker: string
  name: string
  shares: string
  costBasisPerShare: string
  purchaseDate: string
  currentPrice: string
  volatilityOverride: string  // empty = use ticker lookup
}

const today = new Date().toISOString().split('T')[0]

function emptyForm(): FormState {
  return { ticker: '', name: '', shares: '', costBasisPerShare: '', purchaseDate: '', currentPrice: '', volatilityOverride: '' }
}

function positionToForm(p: Position): FormState {
  return {
    ticker: p.ticker,
    name: p.name,
    shares: p.shares.toString(),
    costBasisPerShare: p.costBasisPerShare.toString(),
    purchaseDate: p.purchaseDate,
    currentPrice: p.currentPrice.toString(),
    volatilityOverride: p.volatilityOverride != null ? p.volatilityOverride.toString() : '',
  }
}

function divideByShares(totalStr: string, sharesStr: string): string {
  const total = parseFloat(totalStr)
  const shares = parseFloat(sharesStr)
  if (isNaN(total) || isNaN(shares) || shares <= 0) return ''
  return (total / shares).toFixed(4)
}

export default function PositionForm({ editingPosition, onClose }: Props) {
  const { addPosition, updatePosition } = useAppStore()
  const [form, setForm] = useState<FormState>(
    editingPosition ? positionToForm(editingPosition) : emptyForm()
  )
  const [errors, setErrors] = useState<Partial<FormState>>({})

  // Toggle: enter total market value vs per-share price
  const [priceMode, setPriceMode] = useState<'per-share' | 'total'>('per-share')
  const [totalPriceInput, setTotalPriceInput] = useState('')

  // Toggle: enter total acquisition cost vs per-share basis
  const [basisMode, setBasisMode] = useState<'per-share' | 'total'>('per-share')
  const [totalBasisInput, setTotalBasisInput] = useState('')

  const [showSchWabGuide, setShowSchwabGuide] = useState(false)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  // Compute derived per-share values from total inputs
  const shares = parseFloat(form.shares)
  const effectivePricePerShare = priceMode === 'per-share'
    ? parseFloat(form.currentPrice)
    : parseFloat(divideByShares(totalPriceInput, form.shares))
  const effectiveBasisPerShare = basisMode === 'per-share'
    ? parseFloat(form.costBasisPerShare)
    : parseFloat(divideByShares(totalBasisInput, form.shares))

  const hasPreview = !isNaN(shares) && shares > 0 && !isNaN(effectivePricePerShare) && !isNaN(effectiveBasisPerShare)
  const totalCostBasis = hasPreview ? effectiveBasisPerShare * shares : null
  const totalCurrentValue = hasPreview ? effectivePricePerShare * shares : null
  const totalGain = hasPreview ? (effectivePricePerShare - effectiveBasisPerShare) * shares : null
  const gainPct = hasPreview && effectiveBasisPerShare > 0
    ? ((effectivePricePerShare - effectiveBasisPerShare) / effectiveBasisPerShare) * 100
    : null

  function setField(field: keyof FormState, value: string) {
    setForm(f => ({ ...f, [field]: value }))
    setErrors(e => ({ ...e, [field]: undefined }))
  }

  // When switching price mode, sync the value
  function switchPriceMode(mode: 'per-share' | 'total') {
    if (mode === 'total') {
      const ps = parseFloat(form.currentPrice)
      if (!isNaN(ps) && !isNaN(shares) && shares > 0)
        setTotalPriceInput((ps * shares).toFixed(2))
    } else {
      const total = parseFloat(totalPriceInput)
      if (!isNaN(total) && !isNaN(shares) && shares > 0)
        setField('currentPrice', (total / shares).toFixed(4))
    }
    setPriceMode(mode)
  }

  function switchBasisMode(mode: 'per-share' | 'total') {
    if (mode === 'total') {
      const ps = parseFloat(form.costBasisPerShare)
      if (!isNaN(ps) && !isNaN(shares) && shares > 0)
        setTotalBasisInput((ps * shares).toFixed(2))
    } else {
      const total = parseFloat(totalBasisInput)
      if (!isNaN(total) && !isNaN(shares) && shares > 0)
        setField('costBasisPerShare', (total / shares).toFixed(4))
    }
    setBasisMode(mode)
  }

  function validate(): boolean {
    const errs: Partial<FormState> = {}
    if (!form.ticker.trim()) errs.ticker = 'Required'
    if (!form.name.trim()) errs.name = 'Required'
    if (!form.shares || isNaN(parseFloat(form.shares)) || parseFloat(form.shares) <= 0)
      errs.shares = 'Must be > 0'

    // Validate effective per-share basis
    if (isNaN(effectiveBasisPerShare) || effectiveBasisPerShare < 0) {
      if (basisMode === 'total') errs.costBasisPerShare = 'Enter total acquisition cost'
      else errs.costBasisPerShare = 'Must be ≥ 0'
    }

    // Validate effective per-share price
    if (isNaN(effectivePricePerShare) || effectivePricePerShare <= 0) {
      if (priceMode === 'total') errs.currentPrice = 'Enter total market value'
      else errs.currentPrice = 'Must be > 0'
    }

    if (!form.purchaseDate) errs.purchaseDate = 'Required'
    if (form.purchaseDate > today) errs.purchaseDate = 'Cannot be in the future'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return
    const volOverride = parseFloat(form.volatilityOverride)
    const data = {
      ticker: form.ticker.trim().toUpperCase(),
      name: form.name.trim(),
      shares: parseFloat(form.shares),
      costBasisPerShare: effectiveBasisPerShare,
      purchaseDate: form.purchaseDate,
      currentPrice: effectivePricePerShare,
      volatilityOverride: !isNaN(volOverride) && volOverride > 0 ? volOverride : undefined,
    }
    if (editingPosition) {
      updatePosition(editingPosition.id, data)
    } else {
      addPosition(data)
    }
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700 sticky top-0 bg-slate-800 z-10">
          <h2 className="text-lg font-bold text-white">
            {editingPosition ? 'Edit Position' : 'Add Position'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xl leading-none">×</button>
        </div>

        {/* Schwab RSU guide */}
        <div className="px-6 pt-4">
          <button
            type="button"
            onClick={() => setShowSchwabGuide(v => !v)}
            className="w-full flex items-center justify-between text-xs text-indigo-400 hover:text-indigo-300 bg-indigo-950/40 border border-indigo-900/50 rounded-lg px-3 py-2 transition-colors"
          >
            <span>📋 Using Schwab RSUs? See how to map your fields</span>
            <span>{showSchWabGuide ? '▲' : '▼'}</span>
          </button>
          {showSchWabGuide && (
            <div className="mt-2 bg-slate-700/40 border border-slate-600/50 rounded-lg p-4 text-xs space-y-2">
              <div className="text-slate-300 font-semibold mb-2">Schwab RSU field → This form</div>
              <Row schwab="Symbol" here="Ticker Symbol" />
              <Row schwab="Date acquired (vesting date)" here="Purchase Date" note="Use vesting date, not grant date" />
              <Row schwab="Available to sell" here="Shares" />
              <Row schwab="Acquisition price (per share)" here="Cost Basis Per Share (per-share mode)" note="Schwab shows $/share at vesting" />
              <Row schwab="Market value (total position)" here='Current Market Price → switch to "Total value"' note="Divide by shares, or use the toggle below" />
              <div className="text-slate-500 mt-2 leading-relaxed">
                Tip: If Schwab shows a per-share price next to acquisition and market value, use per-share mode. If it shows the total for the lot, use the "Enter total value" toggle.
              </div>
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {/* Ticker + Name */}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Ticker Symbol" hint="e.g. GOOG" error={errors.ticker}>
              <input
                type="text"
                value={form.ticker}
                onChange={e => {
                  const t = e.target.value.toUpperCase()
                  setField('ticker', t)
                  // Auto-populate name if field is empty or was previously auto-filled
                  if (!form.name || lookupTickerName(form.ticker) === form.name) {
                    const found = lookupTickerName(t)
                    if (found) setField('name', found)
                  }
                }}
                onBlur={e => {
                  const found = lookupTickerName(e.target.value)
                  if (found && !form.name) setField('name', found)
                }}
                placeholder="GOOG"
                className={inputCls(!!errors.ticker)}
                maxLength={10}
              />
            </Field>
            <Field
              label="Company / Asset Name"
              hint={lookupTickerName(form.ticker) ? '✓ Auto-filled from ticker' : 'Auto-fills for known tickers'}
              error={errors.name}
            >
              <input
                type="text"
                value={form.name}
                onChange={e => setField('name', e.target.value)}
                placeholder="Alphabet Inc."
                className={inputCls(!!errors.name)}
              />
            </Field>
          </div>

          {/* Shares + Purchase date */}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Shares" hint="Schwab: Available to sell" error={errors.shares}>
              <input
                type="number"
                value={form.shares}
                onChange={e => setField('shares', e.target.value)}
                placeholder="55.699"
                min="0"
                step="any"
                className={inputCls(!!errors.shares) + ' font-mono'}
              />
            </Field>
            <Field label="Purchase / Vesting Date" hint="Schwab: Date acquired" error={errors.purchaseDate}>
              <input
                type="date"
                value={form.purchaseDate}
                onChange={e => setField('purchaseDate', e.target.value)}
                max={today}
                className={inputCls(!!errors.purchaseDate) + ' font-mono'}
              />
            </Field>
          </div>

          {/* Cost Basis */}
          <Field
            label="Cost Basis"
            hint={basisMode === 'per-share' ? 'Schwab: Acquisition price ($/share at vesting)' : 'Schwab: Total acquisition cost for the lot'}
            error={errors.costBasisPerShare}
            toggle={
              <ModeToggle
                mode={basisMode}
                perShareLabel="Per share"
                totalLabel="Total lot cost"
                onChange={switchBasisMode}
              />
            }
          >
            {basisMode === 'per-share' ? (
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                <input
                  type="number"
                  value={form.costBasisPerShare}
                  onChange={e => setField('costBasisPerShare', e.target.value)}
                  placeholder="167.74"
                  min="0"
                  step="any"
                  className={inputCls(!!errors.costBasisPerShare) + ' pl-7 font-mono'}
                />
              </div>
            ) : (
              <div className="space-y-1">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                  <input
                    type="number"
                    value={totalBasisInput}
                    onChange={e => setTotalBasisInput(e.target.value)}
                    placeholder="9,344.82"
                    min="0"
                    step="any"
                    className={inputCls(!!errors.costBasisPerShare) + ' pl-7 font-mono'}
                  />
                </div>
                {!isNaN(parseFloat(totalBasisInput)) && !isNaN(shares) && shares > 0 && (
                  <div className="text-xs text-slate-400 font-mono pl-1">
                    = {formatCurrency(parseFloat(totalBasisInput) / shares, 4)}/share
                  </div>
                )}
              </div>
            )}
          </Field>

          {/* Current Price */}
          <Field
            label="Current Market Price"
            hint={priceMode === 'per-share' ? 'Price per single share right now' : 'Schwab: Market value (total position value)'}
            error={errors.currentPrice}
            toggle={
              <ModeToggle
                mode={priceMode}
                perShareLabel="Per share"
                totalLabel="Total value"
                onChange={switchPriceMode}
              />
            }
          >
            {priceMode === 'per-share' ? (
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                <input
                  type="number"
                  value={form.currentPrice}
                  onChange={e => setField('currentPrice', e.target.value)}
                  placeholder="378.39"
                  min="0"
                  step="any"
                  className={inputCls(!!errors.currentPrice) + ' pl-7 font-mono'}
                />
              </div>
            ) : (
              <div className="space-y-1">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                  <input
                    type="number"
                    value={totalPriceInput}
                    onChange={e => setTotalPriceInput(e.target.value)}
                    placeholder="21,076.50"
                    min="0"
                    step="any"
                    className={inputCls(!!errors.currentPrice) + ' pl-7 font-mono'}
                  />
                </div>
                {!isNaN(parseFloat(totalPriceInput)) && !isNaN(shares) && shares > 0 && (
                  <div className="text-xs text-slate-400 font-mono pl-1">
                    = {formatCurrency(parseFloat(totalPriceInput) / shares, 4)}/share
                  </div>
                )}
              </div>
            )}
          </Field>

          {/* Volatility assumption */}
          {(() => {
            const ticker = form.ticker.trim().toUpperCase()
            const known = ticker ? isVolKnown(ticker) : false
            const lookupVol = ticker ? getTickerVol(ticker) : DEFAULT_VOL
            const overrideVal = parseFloat(form.volatilityOverride)
            const hasOverride = !isNaN(overrideVal) && overrideVal > 0
            return (
              <Field
                label="Volatility Assumption"
                hint={
                  hasOverride
                    ? `Custom override · clears to use ticker data`
                    : known
                    ? `Using ${lookupVol}% for ${ticker} (from built-in data)`
                    : ticker
                    ? `${ticker} not in database — defaulting to ${DEFAULT_VOL}%. Enter a value to override.`
                    : `Will use ticker data or ${DEFAULT_VOL}% default`
                }
              >
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <input
                      type="number"
                      value={form.volatilityOverride}
                      onChange={e => setField('volatilityOverride', e.target.value)}
                      placeholder={ticker ? `${lookupVol} (${known ? ticker + ' estimate' : 'default'})` : '22'}
                      min="1"
                      max="200"
                      step="1"
                      className={inputCls(false) + ' font-mono pr-8'}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">%</span>
                  </div>
                  {hasOverride && (
                    <button
                      type="button"
                      onClick={() => setField('volatilityOverride', '')}
                      className="text-xs text-slate-400 hover:text-slate-200 px-2 py-2 rounded bg-slate-700 hover:bg-slate-600 transition-colors whitespace-nowrap"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </Field>
            )
          })()}

          {/* Live preview */}
          {hasPreview && totalGain !== null && totalCurrentValue !== null && totalCostBasis !== null && gainPct !== null && (
            <div className={`rounded-lg px-4 py-3 text-sm border space-y-2 ${
              totalGain >= 0
                ? 'bg-green-950/40 border-green-800/50'
                : 'bg-red-950/40 border-red-800/50'
            }`}>
              <div className="flex justify-between items-center">
                <span className="text-slate-400 text-xs">Total cost basis</span>
                <span className="font-mono text-slate-300">{formatCurrency(totalCostBasis)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400 text-xs">Total current value</span>
                <span className="font-mono text-white font-semibold">{formatCurrency(totalCurrentValue)}</span>
              </div>
              <div className="border-t border-slate-600/50 pt-2 flex justify-between items-center">
                <span className={`text-xs font-semibold ${totalGain >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {totalGain >= 0 ? '▲ Gain' : '▼ Loss'}
                </span>
                <span className={`font-mono font-bold ${totalGain >= 0 ? 'text-green-300' : 'text-red-300'}`}>
                  {formatCurrency(Math.abs(totalGain))}
                  <span className="font-normal text-xs ml-2 opacity-70">({Math.abs(gainPct).toFixed(1)}%)</span>
                </span>
              </div>
              <div className="flex justify-between text-xs text-slate-500">
                <span>Per share basis: {formatCurrency(effectiveBasisPerShare, 4)}</span>
                <span>Per share price: {formatCurrency(effectivePricePerShare, 4)}</span>
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-slate-700 hover:bg-slate-600 text-white font-semibold py-2.5 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-2.5 rounded-lg transition-colors"
            >
              {editingPosition ? 'Save Changes' : 'Add Position'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function Row({ schwab, here, note }: { schwab: string; here: string; note?: string }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <div className="text-amber-400/80">{schwab}</div>
      <div className="text-slate-300">
        {here}
        {note && <div className="text-slate-500 text-[10px] mt-0.5">{note}</div>}
      </div>
    </div>
  )
}

function ModeToggle({
  mode, perShareLabel, totalLabel, onChange
}: {
  mode: 'per-share' | 'total'
  perShareLabel: string
  totalLabel: string
  onChange: (m: 'per-share' | 'total') => void
}) {
  return (
    <div className="flex rounded-md overflow-hidden border border-slate-600 text-[10px]">
      <button
        type="button"
        onClick={() => onChange('per-share')}
        className={`px-2 py-0.5 transition-colors ${
          mode === 'per-share' ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-400 hover:text-slate-200'
        }`}
      >
        {perShareLabel}
      </button>
      <button
        type="button"
        onClick={() => onChange('total')}
        className={`px-2 py-0.5 transition-colors ${
          mode === 'total' ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-400 hover:text-slate-200'
        }`}
      >
        {totalLabel}
      </button>
    </div>
  )
}

interface FieldProps {
  label: string
  hint?: string
  error?: string
  toggle?: React.ReactNode
  children: React.ReactNode
}

function Field({ label, hint, error, toggle, children }: FieldProps) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <div>
          <label className="text-xs text-slate-400 font-medium">{label}</label>
          {hint && <div className="text-[10px] text-slate-600 mt-0.5">{hint}</div>}
        </div>
        {toggle}
      </div>
      {children}
      {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
    </div>
  )
}

function inputCls(hasError: boolean) {
  return `w-full bg-slate-700 border text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
    hasError ? 'border-red-500' : 'border-slate-600'
  }`
}
