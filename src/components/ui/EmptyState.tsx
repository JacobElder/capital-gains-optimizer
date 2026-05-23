interface Props {
  onAdd: () => void
  onImport: () => void
}

export default function EmptyState({ onAdd, onImport }: Props) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="text-6xl mb-6">📈</div>
      <h2 className="text-2xl font-bold text-white mb-2">No positions yet</h2>
      <p className="text-slate-400 mb-8 max-w-sm">
        Add your stock positions to see whether to sell now or wait for long-term capital gains treatment.
      </p>
      <div className="flex items-center gap-3">
        <button
          onClick={onImport}
          className="border border-slate-600 hover:border-slate-500 text-slate-300 hover:text-white font-semibold px-5 py-3 rounded-lg transition-colors flex items-center gap-2"
        >
          <span>📋</span> Import CSV
        </button>
        <button
          onClick={onAdd}
          className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-6 py-3 rounded-lg transition-colors"
        >
          Add Manually
        </button>
      </div>
    </div>
  )
}
