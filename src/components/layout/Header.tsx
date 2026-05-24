export default function Header() {
  return (
    <header className="bg-[#002B45] px-4 py-0">
      <div className="max-w-4xl mx-auto flex items-center justify-between h-14">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-[#1B6B3A] rounded flex items-center justify-center flex-shrink-0">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <polyline points="1,12 5,7 9,10 15,3" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <polyline points="11,3 15,3 15,7" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div>
            <h1 className="text-sm font-bold text-white leading-none tracking-tight">Capital Gains Optimizer</h1>
            <p className="text-xs text-blue-300/70 mt-0.5">STCG vs LTCG tax planning · 2025 rates</p>
          </div>
        </div>
        <div className="text-xs text-blue-200/50 text-right hidden sm:block">
          Planning purposes only · Not tax advice
        </div>
      </div>
    </header>
  )
}
