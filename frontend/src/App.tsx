import { useEffect, useState } from 'react'
import { AppProvider, useApp } from './context/AppContext'
import { TabBar } from './components/TabBar'
import type { TabId } from './components/TabBar'
import { ShiftScreen } from './screens/ShiftScreen'
import { HistoryScreen } from './screens/HistoryScreen'
import { SummaryScreen } from './screens/SummaryScreen'
import { ProfileScreen } from './screens/ProfileScreen'
import { initTelegram } from './telegram'

function Shell() {
  const [tab, setTab] = useState<TabId>('shift')
  const { toast } = useApp()

  useEffect(() => {
    initTelegram()
  }, [])

  return (
    <div className="app">
      {tab === 'shift' && <ShiftScreen />}
      {tab === 'history' && <HistoryScreen />}
      {tab === 'summary' && <SummaryScreen />}
      {tab === 'profile' && <ProfileScreen />}
      <TabBar active={tab} onChange={setTab} />
      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}

export default function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  )
}
