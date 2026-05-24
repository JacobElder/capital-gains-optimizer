import { useMemo, useState } from 'react'
import { useAppStore } from '../../store/useAppStore'
import { analyzePosition, formatCurrency, formatRate, riskSigmaContext } from '../../lib/taxEngine'
import RiskBadge from '../ui/RiskBadge'
import HoldingProgressBar from '../charts/HoldingProgressBar'
import BreakevenChart from '../charts/BreakevenChart'
import type { Position } from '../../types'

interface Props {
  position: Position
  onEdit: () => void
}

function GainArrow({ positive }: { positive: boolean }) {
  return positive
    ? <span className="text-green-600">▲</span>
    : <span className="text-red-500">▼</span>
}

function RiskVerdict({
  riskLevel, dropCushionPercent, taxSavings, stcgPreferred,
  breakevenPrice, costBasis, daysUntilLongTerm,
}: {
  riskLevel: string; dropCushionPercent: number; taxSavings: number; stcgPreferred: boolean
  breakevenPrice: number; costBasis: number; daysUntilLongTerm: number
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
          Your state's LTCG rate is higher than its STCG rate. Selling before the 1-year mark results in less tax.
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
        <p className="text-slate-500 text-xs">Selling at a loss can offset other capital gains and reduce your overall tax bill.</p>
      </div>
    )
  }

  const daysNote = daysUntilLongTerm === 1 ? '1 day' : `${daysUntilLongTerm} days`

  const verdicts: Record<string, { icon: string; title: string; body: string; note: string; classes: string; noteClasses: string }> = {
    high: {
      icon: '▲',
      title: 'Risky to Wait — Tax Advantage Thin',
      body: `The stock only needs to drop ${dropCushionPercent.toFixed(1)}% over the next ${daysNote} to make selling today equally profitable after tax. A ${dropCushionPercent.toFixed(1)}% swing is within normal daily volatility for most stocks, so the ${formatCurrency(taxSavings)} tax savings carry real risk of evaporating.`,
      note: gainAtBreakeven > 0
        ? `Note: "Risk" here refers only to the tax decision. Even at the break-even price (${formatCurrency(breakevenPrice, 2)}), you'd still show a ${gainAtBreakeven.toFixed(0)}% gain from your cost basis.`
        : '',
      classes: 'bg-red-50 border-red-200 text-red-800',
      noteClasses: 'text-red-400',
    },
    moderate: {
      icon: '●',
      title: 'Moderate — Weigh Your Conviction',
      body: `The stock needs to drop ${dropCushionPercent.toFixed(1)}% over the next ${daysNote} for selling today to be equally good after tax. Based on typical large-cap volatility, that's a plausible but not likely move in this window. The ${formatCurrency(taxSavings)} tax savings are meaningful — if you believe the stock is stable, waiting is probably right.`,
      note: gainAtBreakeven > 0
        ? `Note: This risk rating is about the tax optimization window only — not your overall investment. Even at the break-even price (${formatCurrency(breakevenPrice, 2)}), you'd still be up ${gainAtBreakeven.toFixed(0)}% from your cost basis.`
        : '',
      classes: 'bg-amber-50 border-amber-200 text-amber-800',
      noteClasses: 'text-amber-500',
    },
    low: {
      icon: '●',
      title: 'Low Risk — Worth Waiting',
      body: `The stock would need to fall ${dropCushionPercent.toFixed(1)}% in the next ${daysNote} for selling today to be equally good after tax. Based on typical large-cap volatility, that would require an unusual move in a short window. With ${formatCurrency(taxSavings)} in tax savings on the line, waiting strongly favors the LTCG rate.`,
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

export default function PositionCard({ position, onEdit }: Props) {
  const { settings, deletePosition } = useAppStore()
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
  } = analysis

  const { annualizedVol, volIsOverride } = analysis
  const canShowBreakeven = !isLoss && !isLongTerm && !stcgPreferred
  const sigmaCtx = canShowBreakeven ? riskSigmaContext(daysUntilLongTerm, annualizedVol) : null

  const borderAccent =
    riskLevel === 'high' ? 'border-l-4 border-l-red-400' :
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
                <div className="text-xs text-slate-400 mt-0.5">{formatRate(stcgCombinedRate)} rate</div>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-md p-3 text-center">
                <div className="text-xs text-slate-500 mb-1">
                  Wait for <span className="text-green-600">(LTCG)</span>
                </div>
                <div className="font-mono text-green-700 font-bold text-sm">{formatCurrency(taxIfSoldAsLTCG)}</div>
                <div className="text-xs text-slate-400 mt-0.5">{formatRate(ltcgCombinedRate)} rate</div>
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
                <div className="text-xs text-slate-400 mt-0.5">by waiting</div>
              </div>
            </div>
            {niitApplies && (
              <p className="text-xs text-amber-600 mt-2">
                ⚠️ +3.8% NIIT included — applies because your income exceeds the federal threshold.
              </p>
            )}
            {nycRate > 0 && (
              <p className="text-xs text-amber-600 mt-1">
                ⚠️ +{(nycRate * 100).toFixed(3)}% NYC city tax included in rates above.
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
                The break-even price is the lowest price at which waiting for LTCG still gives you the same
                after-tax proceeds as selling today.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-50 border border-slate-200 rounded-md p-3">
                <div className="text-xs text-slate-500 mb-1">Net If Sold Now</div>
                <div className="font-mono text-slate-900 font-bold text-sm">{formatCurrency(netProceedsNow)}</div>
                <div className="text-xs text-slate-400">after {formatRate(stcgCombinedRate)} STCG tax</div>
              </div>
              <div className={`rounded-md p-3 border ${
                dropCushionPercent < 5
                  ? 'bg-red-50 border-red-200'
                  : dropCushionPercent < 15
                  ? 'bg-amber-50 border-amber-200'
                  : 'bg-green-50 border-green-200'
              }`}>
                <div className="text-xs text-slate-500 mb-1">Break-Even Price</div>
                <div className={`font-mono font-bold text-sm ${
                  dropCushionPercent < 5 ? 'text-red-700' :
                  dropCushionPercent < 15 ? 'text-amber-700' : 'text-green-700'
                }`}>{formatCurrency(breakevenPrice, 2)}</div>
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
                      className={`absolute top-2 h-1 rounded-full ${
                        dropCushionPercent < 5 ? 'bg-red-400' :
                        dropCushionPercent < 15 ? 'bg-amber-400' : 'bg-green-500'
                      }`}
                      style={{ left: `${breakevenPos}%`, width: `${currentPos - breakevenPos}%` }}
                    />
                    <div
                      className="absolute top-1.5 w-2 h-2 bg-slate-400 rounded-full border border-white -translate-x-1/2"
                      style={{ left: `${basisPos}%` }}
                    />
                    <div
                      className={`absolute top-1.5 w-2.5 h-2.5 rounded-full border-2 border-white -translate-x-1/2 ${
                        dropCushionPercent < 5 ? 'bg-red-500' :
                        dropCushionPercent < 15 ? 'bg-amber-500' : 'bg-green-500'
                      }`}
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
                <div className={`flex items-center gap-1 ${
                  dropCushionPercent < 5 ? 'text-red-600' :
                  dropCushionPercent < 15 ? 'text-amber-600' : 'text-green-600'
                }`}>
                  <span>●</span> Break-even {formatCurrency(breakevenPrice, 2)}
                </div>
                <div className="flex items-center gap-1 text-[#002B45]">
                  <span>●</span> Current {formatCurrency(position.currentPrice, 2)}
                </div>
              </div>
            </div>

            {sigmaCtx && (
              <p className="text-xs text-slate-400 leading-relaxed">
                Risk calibrated using{' '}
                <span className="text-slate-500">
                  {annualizedVol}% annualized vol
                  {volIsOverride ? ' (your override)' : ` (${position.ticker} estimate)`}
                </span>
                {' '}· for {daysUntilLongTerm} days, 1σ = ±{sigmaCtx.sigmaPct.toFixed(1)}%.
                High &lt;{sigmaCtx.highThreshold.toFixed(1)}%, Low &gt;{sigmaCtx.lowThreshold.toFixed(1)}% cushion.
              </p>
            )}

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
        />
      </div>
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
