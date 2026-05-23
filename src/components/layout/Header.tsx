export default function Header() {
  return (
    <header className="bg-slate-900 border-b border-slate-700/50 px-4 py-4">
      <div className="max-w-6xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">📈</span>
          <div>
            <h1 className="text-lg font-bold text-white leading-none">Capital Gains Optimizer</h1>
            <p className="text-xs text-slate-500 mt-0.5">Should you sell now or wait for LTCG?</p>
          </div>
        </div>
        <div className="text-xs text-slate-500 text-right hidden sm:block">
          <div>2025 tax rates</div>
          <div className="text-slate-600">Planning purposes only</div>
        </div>
      </div>
    </header>
  )
}
