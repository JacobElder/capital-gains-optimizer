interface Props {
  onAdd: () => void
  onImport: () => void
}

export default function EmptyState({ onAdd, onImport }: Props) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-6">
        <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
        </svg>
      </div>
      <h2 className="text-xl font-bold text-slate-800 mb-2">No positions yet</h2>
      <p className="text-slate-500 mb-8 max-w-sm text-sm leading-relaxed">
        Add your stock positions to analyze whether to sell now or wait for long-term capital gains treatment.
      </p>
      <div className="flex items-center gap-3">
        <button
          onClick={onImport}
          className="border border-slate-300 hover:border-slate-400 bg-white text-slate-700 hover:text-slate-900 font-medium px-5 py-2.5 rounded-md transition-colors text-sm flex items-center gap-2 shadow-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Import CSV
        </button>
        <button
          onClick={onAdd}
          className="bg-[#1B6B3A] hover:bg-[#155E34] text-white font-semibold px-6 py-2.5 rounded-md transition-colors text-sm shadow-sm"
        >
          Add Position
        </button>
      </div>
    </div>
  )
}
