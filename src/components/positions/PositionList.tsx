import { useMemo, useState } from 'react'
import { useAppStore } from '../../store/useAppStore'
import { analyzePosition } from '../../lib/taxEngine'
import PositionCard from './PositionCard'
import PositionForm from './PositionForm'
import SchwabImportModal from './SchwabImportModal'
import EmptyState from '../ui/EmptyState'
import PortfolioDashboard from '../charts/PortfolioDashboard'

type SortKey = 'urgency' | 'savings' | 'gain' | 'risk'

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
  const { positions, settings, editingPositionId, isAddingPosition, setEditingPositionId, setIsAddingPosition, clearPositions } = useAppStore()
  const [sortKey, setSortKey] = useState<SortKey>('urgency')
  const [showImport, setShowImport] = useState(false)

  const analyses = useMemo(
    () => positions.map(p => analyzePosition(p, settings)),
    [positions, settings]
  )

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

  if (positions.length === 0) {
    return (
      <>
        <EmptyState onAdd={() => setIsAddingPosition(true)} onImport={() => setShowImport(true)} />
        {isAddingPosition && <PositionForm onClose={() => setIsAddingPosition(false)} />}
        {showImport && <SchwabImportModal onClose={() => setShowImport(false)} />}
      </>
    )
  }

  const editingPosition = editingPositionId ? positions.find(p => p.id === editingPositionId) : undefined

  return (
    <div>
      {/* Portfolio dashboard (replaces old 4-column summary bar) */}
      <PortfolioDashboard analyses={analyses} />

      {/* Controls */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">Sort by:</span>
          {(Object.entries(SORT_LABELS) as [SortKey, string][]).map(([k, l]) => (
            <button
              key={k}
              onClick={() => setSortKey(k)}
              className={`text-xs px-3 py-1.5 rounded-full transition-colors ${
                sortKey === k
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-700 text-slate-400 hover:bg-slate-600 hover:text-white'
              }`}
            >
              {l}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              if (window.confirm(`Remove all ${positions.length} position${positions.length !== 1 ? 's' : ''}? This cannot be undone.`)) {
                clearPositions()
              }
            }}
            className="border border-red-900/60 hover:border-red-700 text-red-400/70 hover:text-red-300 text-sm font-medium px-3 py-2 rounded-lg transition-colors"
          >
            Clear All
          </button>
          <button
            onClick={() => setShowImport(true)}
            className="border border-slate-600 hover:border-slate-500 text-slate-300 hover:text-white text-sm font-medium px-3 py-2 rounded-lg transition-colors flex items-center gap-1.5"
          >
            <span>📋</span> Import CSV
          </button>
          <button
            onClick={() => setIsAddingPosition(true)}
            className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors flex items-center gap-1.5"
          >
            <span>+</span> Add Position
          </button>
        </div>
      </div>

      {/* Cards */}
      <div className="space-y-4">
        {sorted.map(a => (
          <PositionCard
            key={a.position.id}
            position={a.position}
            onEdit={() => setEditingPositionId(a.position.id)}
          />
        ))}
      </div>

      {/* Modals */}
      {isAddingPosition && (
        <PositionForm onClose={() => setIsAddingPosition(false)} />
      )}
      {editingPosition && (
        <PositionForm
          editingPosition={editingPosition}
          onClose={() => setEditingPositionId(null)}
        />
      )}
      {showImport && <SchwabImportModal onClose={() => setShowImport(false)} />}
    </div>
  )
}
