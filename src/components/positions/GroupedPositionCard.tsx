import { useState } from 'react'
import type { PositionAnalysis } from '../../types'
import { formatCurrency } from '../../lib/taxEngine'
import PositionCard from './PositionCard'

interface Props {
  ticker: string
  analyses: PositionAnalysis[]
  onEdit: (id: string) => void
  readOnly?: boolean
}

export default function GroupedPositionCard({ ticker, analyses, onEdit, readOnly }: Props) {
  const [expanded, setExpanded] = useState(false)

  const totalValue = analyses.reduce((s, a) => s + a.currentValue, 0)
  const totalGain = analyses.reduce((s, a) => s + a.gainAmount, 0)
  const totalSavings = analyses.filter(a => !a.isLoss && !a.isLongTerm).reduce((s, a) => s + a.taxSavingsFromWaiting, 0)
  const isLoss = totalGain < 0
  const companyName = analyses[0]?.position.name ?? ticker

  const riskCounts: Record<string, number> = {}
  for (const a of analyses) {
    riskCounts[a.riskLevel] = (riskCounts[a.riskLevel] ?? 0) + 1
  }

  const actionable = analyses.filter(a => !a.isLongTerm && !a.isLoss)
  const mostUrgent = actionable.length > 0
    ? actionable.reduce((min, a) => a.daysUntilLongTerm < min.daysUntilLongTerm ? a : min)
    : null

  const RISK_BADGE_STYLES: Record<string, string> = {
    high: 'bg-red-50 border-red-200 text-red-700',
    moderate: 'bg-amber-50 border-amber-200 text-amber-700',
    low: 'bg-green-50 border-green-200 text-green-700',
    loss: 'bg-slate-100 border-slate-300 text-slate-600',
    'already-ltcg': 'bg-blue-50 border-blue-200 text-blue-700',
    'stcg-preferred': 'bg-orange-50 border-orange-200 text-orange-700',
  }
  const RISK_ICONS: Record<string, string> = {
    high: '▲', moderate: '●', low: '●', loss: '▼', 'already-ltcg': '✓', 'stcg-preferred': '!',
  }

  const dominantRisk = Object.entries(riskCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'low'

  const borderAccent =
    dominantRisk === 'high' ? 'border-l-4 border-l-red-400' :
    dominantRisk === 'moderate' ? 'border-l-4 border-l-amber-400' :
    dominantRisk === 'low' ? 'border-l-4 border-l-green-500' :
    dominantRisk === 'already-ltcg' ? 'border-l-4 border-l-blue-400' : ''

  return (
    <div className={`bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden ${borderAccent}`}>

      {/* Header */}
      <div className="px-5 py-4 flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className={`w-9 h-9 rounded-md flex items-center justify-center text-xs font-bold flex-shrink-0
            ${isLoss ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-700'}`}>
            {ticker.slice(0, 2)}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-slate-900 text-base">{ticker}</span>
              <span className="text-slate-500 text-sm truncate">{companyName}</span>
              <span className="text-xs bg-slate-100 border border-slate-200 text-slate-500 rounded px-2 py-0.5 font-medium">
                {analyses.length} lots
              </span>
            </div>
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              <span className="text-xs text-slate-500 font-mono">{formatCurrency(totalValue)}</span>
              <span className={`text-xs font-mono font-semibold ${isLoss ? 'text-red-600' : 'text-green-700'}`}>
                {totalGain >= 0 ? '+' : ''}{formatCurrency(totalGain)} gain
              </span>
              {totalSavings > 0 && (
                <span className="text-xs text-[#1B6B3A] font-mono font-semibold">
                  {formatCurrency(totalSavings)} potential savings
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="hidden sm:flex items-center gap-1 flex-wrap justify-end max-w-[200px]">
            {Object.entries(riskCounts).map(([risk, count]) => (
              <span
                key={risk}
                className={`text-xs border rounded px-2 py-0.5 font-medium ${RISK_BADGE_STYLES[risk] ?? ''}`}
              >
                {RISK_ICONS[risk]} {count}
              </span>
            ))}
          </div>
          <button
            onClick={() => setExpanded(e => !e)}
            className="text-slate-500 hover:text-slate-800 transition-colors text-xs bg-slate-100 hover:bg-slate-200 border border-slate-200 px-2.5 py-1.5 rounded-md font-medium"
          >
            {expanded ? '▲ Collapse' : '▼ Expand'}
          </button>
        </div>
      </div>

      {mostUrgent && (
        <div className="px-5 pb-3">
          <span className="text-xs text-slate-400">
            Next LTCG: <span className="text-[#002B45] font-semibold">{mostUrgent.daysUntilLongTerm} day{mostUrgent.daysUntilLongTerm !== 1 ? 's' : ''}</span>
            {analyses.length > 1 && ` · most urgent of ${analyses.length} lots`}
          </span>
        </div>
      )}

      {expanded && (
        <div className="border-t border-slate-100 px-4 py-4 space-y-3 bg-slate-50">
          {analyses.map(a => (
            <PositionCard
              key={a.position.id}
              position={a.position}
              onEdit={() => onEdit(a.position.id)}
              readOnly={readOnly}
            />
          ))}
        </div>
      )}
    </div>
  )
}
