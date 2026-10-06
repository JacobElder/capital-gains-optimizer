import { useMemo, useState } from 'react'
import { useAppStore } from '../../store/useAppStore'
import { useViewData } from '../../store/useViewData'
import { analyzePosition } from '../../lib/taxEngine'
import PositionCard from './PositionCard'
import GroupedPositionCard from './GroupedPositionCard'
import PositionForm from './PositionForm'
import SchwabImportModal from './SchwabImportModal'
import EmptyState from '../ui/EmptyState'
import PortfolioDashboard from '../charts/PortfolioDashboard'

type SortKey = 'urgency' | 'savings' | 'gain' | 'risk'
type ViewMode = 'individual' | 'grouped'

const SORT_LABELS: Record<SortKey, string> = {
  urgency: 'Days to LTCG',
  risk: 'Risk Level',
  savings: 'Tax Savings',
  gain: 'Gain Amount',
}

const RISK_ORDER: Record<string, number> = {
  high: 0, 'stcg-preferred': 1, moderate: 2, low: 3, 'already-ltcg': 4, loss: 5,
}

export default function PositionList() {
  const { editingPositionId, isAddingPosition, setEditingPositionId, setIsAddingPosition, clearPositions } = useAppStore()
  const setPrivacy = useAppStore(s => s.setPrivacy)
  const { positions, settings, isDemo } = useViewData()
  const readOnly = isDemo
  const [sortKey, setSortKey] = useState<SortKey>('urgency')
  const [showImport, setShowImport] = useState(false)

  const analyses = useMemo(
    () => positions.map(p => analyzePosition(p, settings)),
    [positions, settings]
  )

  const hasGroupableTickers = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const p of positions) counts[p.ticker] = (counts[p.ticker] ?? 0) + 1
    return Object.values(counts).some(c => c > 1)
  }, [positions])

  const [viewMode, setViewMode] = useState<ViewMode | null>(null)
  const effectiveViewMode: ViewMode = viewMode ?? (hasGroupableTickers ? 'grouped' : 'individual')

  const sorted = useMemo(() => {
    return [...analyses].sort((a, b) => {
      switch (sortKey) {
        case 'urgency':
          if (a.isLongTerm && b.isLongTerm) return 0
          if (a.isLongTerm) return 1
          if (b.isLongTerm) return -1
          return a.daysUntilLongTerm - b.daysUntilLongTerm
        case 'risk':
          return RISK_ORDER[a.riskLevel] - RISK_ORDER[b.riskLevel]
        case 'savings':
          return b.taxSavingsFromWaiting - a.taxSavingsFromWaiting
        case 'gain':
          return b.gainAmount - a.gainAmount
      }
    })
  }, [analyses, sortKey])

  const groupedByTicker = useMemo(() => {
    const map = new Map<string, typeof sorted>()
    for (const a of sorted) {
      const existing = map.get(a.position.ticker) ?? []
      existing.push(a)
      map.set(a.position.ticker, existing)
    }
    return map
  }, [sorted])

  if (positions.length === 0 && isDemo) {
    return (
      <div className="text-center py-20 text-sm text-slate-500 space-y-3">
        <p>There are no positions to anonymize yet.</p>
        <button
          onClick={() => setPrivacy({ mode: 'sample' })}
          className="bg-[#002B45] text-white text-sm font-medium px-4 py-2 rounded-md"
        >
          Show a sample portfolio instead
        </button>
      </div>
    )
  }

  if (positions.length === 0) {
    return (
      <>
        <EmptyState onAdd={() => setIsAddingPosition(true)} onImport={() => setShowImport(true)} />
        {isAddingPosition && <PositionForm onClose={() => setIsAddingPosition(false)} />}
        {showImport && <SchwabImportModal onClose={() => setShowImport(false)} />}
      </>
    )
  }

  const editingPosition = !readOnly && editingPositionId ? positions.find(p => p.id === editingPositionId) : undefined

  return (
    <div>
      <PortfolioDashboard analyses={analyses} />

      {/* Controls */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="flex items-center gap-2">
          {/* View mode toggle */}
          <div className="flex gap-0 bg-white border border-slate-200 rounded-md p-0.5 shadow-sm mr-1">
            {(['grouped', 'individual'] as ViewMode[]).map(mode => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`text-xs px-3 py-1.5 rounded transition-colors font-medium ${
                  effectiveViewMode === mode
                    ? 'bg-[#002B45] text-white'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {mode === 'grouped' ? 'Grouped' : 'Individual'}
              </button>
            ))}
          </div>
          <span className="text-xs text-slate-400">Sort:</span>
          {(Object.entries(SORT_LABELS) as [SortKey, string][]).map(([k, l]) => (
            <button
              key={k}
              onClick={() => setSortKey(k)}
              className={`text-xs px-3 py-1.5 rounded-md transition-colors border font-medium ${
                sortKey === k
                  ? 'bg-[#002B45] text-white border-[#002B45]'
                  : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300 hover:text-slate-800'
              }`}
            >
              {l}
            </button>
          ))}
        </div>
        {!readOnly && <div className="flex items-center gap-2">
          <button
            onClick={() => {
              if (window.confirm(`Remove all ${positions.length} position${positions.length !== 1 ? 's' : ''}? This cannot be undone.`)) {
                clearPositions()
              }
            }}
            className="border border-red-200 hover:border-red-300 text-red-500 hover:text-red-700 text-sm font-medium px-3 py-2 rounded-md transition-colors bg-white"
          >
            Clear All
          </button>
          <button
            onClick={() => setShowImport(true)}
            className="border border-slate-200 hover:border-slate-300 text-slate-600 hover:text-slate-900 text-sm font-medium px-3 py-2 rounded-md transition-colors bg-white shadow-sm flex items-center gap-1.5"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Import CSV
          </button>
          <button
            onClick={() => setIsAddingPosition(true)}
            className="bg-[#1B6B3A] hover:bg-[#155E34] text-white text-sm font-semibold px-4 py-2 rounded-md transition-colors shadow-sm flex items-center gap-1.5"
          >
            <span>+</span> Add Position
          </button>
        </div>}
      </div>

      {/* Cards */}
      <div className="space-y-3">
        {effectiveViewMode === 'individual'
          ? sorted.map(a => (
              <PositionCard
                key={a.position.id}
                position={a.position}
                onEdit={() => setEditingPositionId(a.position.id)}
                readOnly={readOnly}
              />
            ))
          : Array.from(groupedByTicker.entries()).map(([ticker, tickerAnalyses]) =>
              tickerAnalyses.length === 1
                ? (
                  <PositionCard
                    key={tickerAnalyses[0].position.id}
                    position={tickerAnalyses[0].position}
                    onEdit={() => setEditingPositionId(tickerAnalyses[0].position.id)}
                    readOnly={readOnly}
                  />
                )
                : (
                  <GroupedPositionCard
                    key={ticker}
                    ticker={ticker}
                    analyses={tickerAnalyses}
                    onEdit={(id) => setEditingPositionId(id)}
                    readOnly={readOnly}
                  />
                )
            )
        }
      </div>

      {isAddingPosition && !readOnly && (
        <PositionForm onClose={() => setIsAddingPosition(false)} />
      )}
      {editingPosition && (
        <PositionForm
          editingPosition={editingPosition}
          onClose={() => setEditingPositionId(null)}
        />
      )}
      {showImport && !readOnly && <SchwabImportModal onClose={() => setShowImport(false)} />}
    </div>
  )
}
