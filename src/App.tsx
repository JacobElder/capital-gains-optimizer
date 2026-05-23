import Header from './components/layout/Header'
import SettingsPanel from './components/layout/SettingsPanel'
import PositionList from './components/positions/PositionList'

export default function App() {
  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <Header />
      <main className="max-w-4xl mx-auto px-4 py-6 space-y-5">
        <SettingsPanel />
        <PositionList />
      </main>
      <footer className="max-w-4xl mx-auto px-4 py-6 text-center text-xs text-slate-700">
        Capital gains tax data reflects 2025 federal and state rates. This tool is for planning purposes only
        and does not constitute tax advice. Consult a qualified CPA or tax attorney before making investment decisions.
      </footer>
    </div>
  )
}
