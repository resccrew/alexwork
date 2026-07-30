import { startTransition, useEffect, useState } from 'react'
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

  // Mounting the next screen (data fetch + render) is the expensive part of a tab
  // switch; marking it as a transition lets React paint the tab-bar's own spring
  // animation first instead of the two competing for the same frame.
  const handleTabChange = (id: TabId) => {
    startTransition(() => setTab(id))
  }

  return (
    <div className="app">
      {tab === 'shift' && <ShiftScreen />}
      {tab === 'history' && <HistoryScreen />}
      {tab === 'summary' && <SummaryScreen />}
      {tab === 'profile' && <ProfileScreen />}
      <TabBar active={tab} onChange={handleTabChange} />
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
