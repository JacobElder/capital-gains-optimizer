import { useMemo, useState } from 'react'
import { useAppStore } from '../../store/useAppStore'
import { useViewData } from '../../store/useViewData'
import { analyzePosition, formatCurrency, formatRate, formatProb } from '../../lib/taxEngine'
import RiskBadge from '../ui/RiskBadge'
import HoldingProgressBar from '../charts/HoldingProgressBar'
import BreakevenChart from '../charts/BreakevenChart'
import type { Position, RiskLevel } from '../../types'

interface Props {
  position: Position
  onEdit: () => void
  readOnly?: boolean
}

// One palette for every risk-colored element on the card, so the break-even
// box, the slider and the badge can never disagree.
const RISK_TONE: Partial<Record<RiskLevel, { box: string; text: string; bar: string; dot: string }>> = {
  high: { box: 'bg-red-50 border-red-200', text: 'text-red-700', bar: 'bg-red-400', dot: 'bg-red-500' },
  moderate: { box: 'bg-amber-50 border-amber-200', text: 'text-amber-700', bar: 'bg-amber-400', dot: 'bg-amber-500' },
  low: { box: 'bg-green-50 border-green-200', text: 'text-green-700', bar: 'bg-green-500', dot: 'bg-green-500' },
}

function GainArrow({ positive }: { positive: boolean }) {
  return positive
    ? <span className="text-green-600">▲</span>
    : <span className="text-red-500">▼</span>
}

function RiskVerdict({
  riskLevel, dropCushionPercent, taxSavings, stcgPreferred,
  breakevenPrice, costBasis, daysUntilLongTerm, probBelowBreakeven, expectedShortfall, isShortTermLoss,
  upsideDownsideRatio,
}: {
  riskLevel: string; dropCushionPercent: number; taxSavings: number; stcgPreferred: boolean
  breakevenPrice: number; costBasis: number; daysUntilLongTerm: number
  probBelowBreakeven: number; expectedShortfall: number; isShortTermLoss: boolean
  upsideDownsideRatio: number
}) {
  const gainAtBreakeven = costBasis > 0
    ? ((breakevenPrice - costBasis) / costBasis) * 100
    : 0

  if (stcgPreferred) {
    return (
      <div className="rounded-md bg-orange-50 border border-orange-200 px-4 py-3 text-sm">
        <div className="flex items-center gap-2 text-orange-800 font-semibold mb-1">
          <span>!</span> Sell Before Long-Term Threshold
        </div>
        <p className="text-orange-700 text-xs leading-relaxed">
          For this gain, long-term treatment costs more tax than short-term (e.g. Washington's 7% tax on long-term
          gains above $278K). Selling before the 1-year mark results in less tax.
        </p>
      </div>
    )
  }

  if (riskLevel === 'already-ltcg') {
    return (
      <div className="rounded-md bg-blue-50 border border-blue-200 px-4 py-3 text-sm">
        <div className="flex items-center gap-2 text-blue-800 font-semibold mb-1">
          <span>✓</span> Already Qualifies for Long-Term Rate
        </div>
        <p className="text-blue-700 text-xs">No action needed — you already receive the lower LTCG tax rate when you sell.</p>
      </div>
    )
  }

  if (riskLevel === 'loss') {
    return (
      <div className="rounded-md bg-slate-50 border border-slate-200 px-4 py-3 text-sm">
        <div className="flex items-center gap-2 text-slate-700 font-semibold mb-1">
          <span>▼</span> Unrealized Loss — Consider Tax-Loss Harvesting
        </div>
        <p className="text-slate-500 text-xs">
          Selling at a loss can offset other capital gains plus up to $3,000 of ordinary income per year.
          {isShortTermLoss && ' Harvesting before the 1-year mark keeps the loss short-term, so it nets first against short-term gains, which are taxed at the higher rate.'}
          {' '}Avoid buying it back within 30 days (wash-sale rule).
        </p>
      </div>
    )
  }

  const daysNote = daysUntilLongTerm === 1 ? '1 day' : `${daysUntilLongTerm} days`
  const odds = formatProb(probBelowBreakeven)
  const shortfall = formatCurrency(expectedShortfall)
  const ratio = formatRatio(upsideDownsideRatio)

  const verdicts: Record<string, { icon: string; title: string; body: string; note: string; classes: string; noteClasses: string }> = {
    high: {
      icon: '▲',
      title: 'Risky to Wait — Tax Advantage Thin',
      body: `A ${dropCushionPercent.toFixed(1)}% drop over the next ${daysNote} would erase the ${formatCurrency(taxSavings)} tax advantage, and at this stock's volatility there is roughly a ${odds} chance of that. For every $1 waiting could cost you, you expect only ${ratio} back — close to a coin flip. Waiting only makes sense if you would hold this stock anyway.`,
      note: gainAtBreakeven > 0
        ? `Note: "Risk" here refers only to the tax decision. Even at the break-even price (${formatCurrency(breakevenPrice, 2)}), you'd still show a ${gainAtBreakeven.toFixed(0)}% gain from your cost basis.`
        : '',
      classes: 'bg-red-50 border-red-200 text-red-800',
      noteClasses: 'text-red-400',
    },
    moderate: {
      icon: '●',
      title: 'Moderate — Weigh Your Conviction',
      body: `The stock would need to drop ${dropCushionPercent.toFixed(1)}% over the next ${daysNote} for selling today to have been better — roughly a ${odds} chance at its volatility. Waiting is worth ${formatCurrency(taxSavings)} if the price holds; for every $1 it could cost you, you expect about ${ratio} back (expected shortfall ${shortfall}).`,
      note: gainAtBreakeven > 0
        ? `Note: This risk rating is about the tax optimization window only — not your overall investment. Even at the break-even price (${formatCurrency(breakevenPrice, 2)}), you'd still be up ${gainAtBreakeven.toFixed(0)}% from your cost basis.`
        : '',
      classes: 'bg-amber-50 border-amber-200 text-amber-800',
      noteClasses: 'text-amber-500',
    },
    low: {
      icon: '●',
      title: 'Low Risk — Worth Waiting',
      body: `The stock would need to fall ${dropCushionPercent.toFixed(1)}% in the next ${daysNote} for selling today to have been better — roughly a ${odds} chance at its volatility. For every $1 waiting could cost you, you expect about ${ratio} back, so with ${formatCurrency(taxSavings)} in tax savings on the line, waiting is favored.`,
      note: gainAtBreakeven > 0
        ? `Even at the break-even price (${formatCurrency(breakevenPrice, 2)}), you'd still be up ${gainAtBreakeven.toFixed(0)}% from your cost basis.`
        : '',
      classes: 'bg-green-50 border-green-200 text-green-800',
      noteClasses: 'text-green-500',
    },
  }

  const v = verdicts[riskLevel]
  if (!v) return null

  return (
    <div className={`rounded-md border px-4 py-3 text-sm space-y-1.5 ${v.classes}`}>
      <div className="flex items-center gap-2 font-semibold text-xs">
        <span>{v.icon}</span> {v.title}
      </div>
      <p className="opacity-80 text-xs leading-relaxed">{v.body}</p>
      {v.note && (
        <p className={`text-xs leading-relaxed italic ${v.noteClasses}`}>{v.note}</p>
      )}
    </div>
  )
}

export default function PositionCard({ position, onEdit, readOnly }: Props) {
  const deletePosition = useAppStore(s => s.deletePosition)
  const { settings } = useViewData()
  const [showChart, setShowChart] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const analysis = useMemo(() => analyzePosition(position, settings), [position, settings])
  const {
    gainAmount, gainPercent, isLoss,
    currentValue,
    taxIfSoldNowSTCG, taxIfSoldAsLTCG, taxSavingsFromWaiting,
    netProceedsNow,
    breakevenPrice, dropCushionPercent,
    riskLevel,
    isLongTerm, daysHeld, daysUntilLongTerm, holdingProgressPercent,
    stcgCombinedRate, ltcgCombinedRate, niitApplies, nycRate, stcgPreferred,
    probBelowBreakeven, expectedGainFromWaiting, expectedShortfall, longTermDate,
  } = analysis

  const { annualizedVol, volIsOverride } = analysis
  const canShowBreakeven = !isLoss && !isLongTerm && !stcgPreferred
  const tone = RISK_TONE[riskLevel] ?? RISK_TONE.low!

  const borderAccent =
    riskLevel === 'high' ? 'border-l-4 border-l-red-400' :
    riskLevel === 'moderate' ? 'border-l-4 border-l-amber-400' :
    riskLevel === 'low' ? 'border-l-4 border-l-green-500' :
    riskLevel === 'already-ltcg' ? 'border-l-4 border-l-blue-400' : ''

  return (
    <div className={`bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden ${borderAccent}`}>

      {/* Header */}
      <div className="px-5 py-4 flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className={`w-9 h-9 rounded-md flex items-center justify-center text-xs font-bold flex-shrink-0
            ${isLoss ? 'bg-red-100 text-red-700' :
              riskLevel === 'already-ltcg' ? 'bg-blue-100 text-blue-700' :
              'bg-slate-100 text-slate-700'}`}>
            {position.ticker.slice(0, 2)}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-slate-900 text-base">{position.ticker}</span>
              <span className="text-slate-500 text-sm truncate">{position.name}</span>
            </div>
            <div className="text-xs text-slate-400 mt-0.5">
              {position.shares.toLocaleString()} shares · basis {formatCurrency(position.costBasisPerShare, 2)}/sh
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <RiskBadge riskLevel={riskLevel} dropCushionPercent={canShowBreakeven ? dropCushionPercent : undefined} />
          {!readOnly && <>
          <button
            onClick={onEdit}
            className="text-slate-400 hover:text-slate-600 transition-colors px-1.5 py-1 text-xs rounded hover:bg-slate-100"
            title="Edit"
          >
            ✏️
          </button>
          {confirmDelete ? (
            <div className="flex items-center gap-1">
              <button
                onClick={() => deletePosition(position.id)}
                className="text-xs bg-red-600 hover:bg-red-700 text-white px-2 py-1 rounded"
              >
                Confirm
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="text-xs text-slate-500 hover:text-slate-700 px-2 py-1"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="text-slate-400 hover:text-red-500 transition-colors px-1.5 py-1 text-xs rounded hover:bg-slate-100"
              title="Delete"
            >
              🗑️
            </button>
          )}
          </>}
        </div>
      </div>

      {/* Price & Gain Row */}
      <div className="px-5 pb-4 grid grid-cols-3 gap-3">
        <Stat label="Current Price" value={formatCurrency(position.currentPrice, 2)} mono />
        <Stat label="Current Value" value={formatCurrency(currentValue)} mono />
        <Stat
          label="Total Gain / Loss"
          value={`${formatCurrency(gainAmount)} (${Math.abs(gainPercent).toFixed(1)}%)`}
          mono
          positive={!isLoss}
          negative={isLoss}
          prefix={<GainArrow positive={!isLoss} />}
        />
      </div>

      <div className="border-t border-slate-100 mx-5" />

      {/* Holding period */}
      <div className="px-5 py-4">
        <HoldingProgressBar
          daysHeld={daysHeld}
          daysUntilLongTerm={daysUntilLongTerm}
          isLongTerm={isLongTerm}
          progressPercent={holdingProgressPercent}
          longTermDate={longTermDate}
        />
      </div>

      {/* Tax comparison */}
      {!isLoss && (
        <>
          <div className="border-t border-slate-100 mx-5" />
          <div className="px-5 py-4">
            <div className="text-xs text-slate-400 mb-3 font-semibold uppercase tracking-wider">Tax Impact</div>
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-slate-50 border border-slate-200 rounded-md p-3 text-center">
                <div className="text-xs text-slate-500 mb-1">
                  Sell Now <span className="text-red-500">(STCG)</span>
                </div>
                <div className="font-mono text-red-600 font-bold text-sm">{formatCurrency(taxIfSoldNowSTCG)}</div>
                <div className="text-xs text-slate-400 mt-0.5">{formatRate(stcgCombinedRate)} effective</div>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-md p-3 text-center">
                <div className="text-xs text-slate-500 mb-1">
                  Wait for <span className="text-green-600">(LTCG)</span>
                </div>
                <div className="font-mono text-green-700 font-bold text-sm">{formatCurrency(taxIfSoldAsLTCG)}</div>
                <div className="text-xs text-slate-400 mt-0.5">{formatRate(ltcgCombinedRate)} effective</div>
              </div>
              <div className={`rounded-md p-3 text-center border ${
                taxSavingsFromWaiting > 0
                  ? 'bg-green-50 border-green-200'
                  : 'bg-red-50 border-red-200'
              }`}>
                <div className="text-xs text-slate-500 mb-1">Tax Savings</div>
                <div className={`font-mono font-bold text-sm ${taxSavingsFromWaiting > 0 ? 'text-green-700' : 'text-red-600'}`}>
                  {taxSavingsFromWaiting >= 0 ? '+' : ''}{formatCurrency(taxSavingsFromWaiting)}
                </div>
                <div className="text-xs text-slate-400 mt-0.5">by waiting, if price holds</div>
              </div>
            </div>
            {niitApplies && (
              <p className="text-xs text-amber-600 mt-2">
                ⚠️ 3.8% NIIT included on the part of this gain that pushes income past the federal threshold.
              </p>
            )}
            {nycRate > 0 && (
              <p className="text-xs text-amber-600 mt-1">
                ⚠️ NYC city tax included in rates above ({formatRate(nycRate)} effective).
              </p>
            )}
          </div>
        </>
      )}

      {/* Break-even analysis */}
      {canShowBreakeven && (
        <>
          <div className="border-t border-slate-100 mx-5" />
          <div className="px-5 py-4 space-y-3">
            <div className="space-y-1">
              <div className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Break-Even Analysis</div>
              <p className="text-xs text-slate-400 leading-relaxed">
                The break-even price is the price on the LTCG date at which waiting nets the same after-tax
                proceeds as selling today. If the stock ends below it, selling today would have been better.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-50 border border-slate-200 rounded-md p-3">
                <div className="text-xs text-slate-500 mb-1">Net If Sold Now</div>
                <div className="font-mono text-slate-900 font-bold text-sm">{formatCurrency(netProceedsNow)}</div>
                <div className="text-xs text-slate-400">after {formatRate(stcgCombinedRate)} STCG tax</div>
              </div>
              <div className={`rounded-md p-3 border ${tone.box}`}>
                <div className="text-xs text-slate-500 mb-1">Break-Even Price</div>
                <div className={`font-mono font-bold text-sm ${tone.text}`}>{formatCurrency(breakevenPrice, 2)}</div>
                <div className="text-xs text-slate-400">
                  {dropCushionPercent.toFixed(1)}% below current
                </div>
              </div>
            </div>

            {/* Visual price range indicator */}
            <div className="bg-slate-50 border border-slate-200 rounded-md p-3">
              <div className="flex justify-between text-xs text-slate-400 mb-2">
                <span>Cost Basis: {formatCurrency(position.costBasisPerShare, 2)}</span>
                <span>Current: {formatCurrency(position.currentPrice, 2)}</span>
              </div>
              {(() => {
                const low = Math.min(position.costBasisPerShare, breakevenPrice) * 0.95
                const high = position.currentPrice * 1.02
                const range = high - low
                const breakevenPos = ((breakevenPrice - low) / range) * 100
                const currentPos = ((position.currentPrice - low) / range) * 100
                const basisPos = ((position.costBasisPerShare - low) / range) * 100
                return (
                  <div className="relative h-5">
                    <div className="absolute top-2 left-0 right-0 h-1 bg-slate-200 rounded-full" />
                    <div
                      className="absolute top-2 h-1 bg-slate-300 rounded-full"
                      style={{ left: `${basisPos}%`, width: `${currentPos - basisPos}%` }}
                    />
                    <div
                      className={`absolute top-2 h-1 rounded-full ${tone.bar}`}
                      style={{ left: `${breakevenPos}%`, width: `${currentPos - breakevenPos}%` }}
                    />
                    <div
                      className="absolute top-1.5 w-2 h-2 bg-slate-400 rounded-full border border-white -translate-x-1/2"
                      style={{ left: `${basisPos}%` }}
                    />
                    <div
                      className={`absolute top-1.5 w-2.5 h-2.5 rounded-full border-2 border-white -translate-x-1/2 ${tone.dot}`}
                      style={{ left: `${breakevenPos}%` }}
                    />
                    <div
                      className="absolute top-1 w-3 h-3 bg-[#002B45] rounded-full border-2 border-white -translate-x-1/2"
                      style={{ left: `${currentPos}%` }}
                    />
                  </div>
                )
              })()}
              <div className="flex justify-between text-xs text-slate-400 mt-3">
                <div className={`flex items-center gap-1 ${tone.text}`}>
                  <span>●</span> Break-even {formatCurrency(breakevenPrice, 2)}
                </div>
                <div className="flex items-center gap-1 text-[#002B45]">
                  <span>●</span> Current {formatCurrency(position.currentPrice, 2)}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <MiniStat label="Chance waiting loses" value={formatProb(probBelowBreakeven)} />
              <MiniStat label="Expected gain from waiting" value={formatCurrency(expectedGainFromWaiting)} />
              <MiniStat label="Expected shortfall" value={formatCurrency(expectedShortfall)} />
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Modeled as a random walk with no expected return (no market forecast) using{' '}
              <span className="text-slate-500">
                {annualizedVol}% annualized volatility
                {volIsOverride ? ' (your override)' : ` (${position.ticker} estimate)`}
              </span>
              {' '}over {daysUntilLongTerm} days. Under that model waiting always wins on average; the risk is the
              spread. Only bear it if you would hold this stock anyway — if you would otherwise diversify, the
              expected shortfall is the price of staying concentrated. Rating: expected upside ÷ expected downside
              of waiting — high risk below 1.25×, low risk at 2× or more.
            </p>

            <button
              onClick={() => setShowChart(v => !v)}
              className="text-xs text-[#1B6B3A] hover:text-[#155E34] transition-colors font-medium"
            >
              {showChart ? '▲ Hide scenario chart' : '▼ Show after-tax scenario chart'}
            </button>
            {showChart && <BreakevenChart analysis={analysis} />}
          </div>
        </>
      )}

      {/* Verdict */}
      <div className="px-5 pb-5">
        <RiskVerdict
          riskLevel={riskLevel}
          dropCushionPercent={dropCushionPercent}
          taxSavings={taxSavingsFromWaiting}
          stcgPreferred={stcgPreferred}
          breakevenPrice={breakevenPrice}
          costBasis={position.costBasisPerShare}
          daysUntilLongTerm={daysUntilLongTerm}
          probBelowBreakeven={probBelowBreakeven}
          expectedShortfall={expectedShortfall}
          isShortTermLoss={isLoss && !isLongTerm}
          upsideDownsideRatio={analysis.upsideDownsideRatio}
        />
      </div>
    </div>
  )
}

function formatRatio(r: number) {
  return Number.isFinite(r) ? `$${r.toFixed(2)}` : 'far more'
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-50 border border-slate-200 rounded-md p-2.5">
      <div className="text-xs text-slate-500 mb-0.5">{label}</div>
      <div className="font-mono text-slate-900 font-semibold text-sm">{value}</div>
    </div>
  )
}

interface StatProps {
  label: string
  value: string
  mono?: boolean
  positive?: boolean
  negative?: boolean
  prefix?: React.ReactNode
}

function Stat({ label, value, mono, positive, negative, prefix }: StatProps) {
  return (
    <div>
      <div className="text-xs text-slate-400 mb-0.5">{label}</div>
      <div className={`text-sm font-semibold flex items-center gap-1
        ${mono ? 'font-mono' : ''}
        ${positive ? 'text-green-700' : negative ? 'text-red-600' : 'text-slate-900'}`}>
        {prefix}
        {value}
      </div>
    </div>
  )
}
