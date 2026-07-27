import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { api } from '../api'
import type { AppConfig, Profile } from '../types'

interface AppContextValue {
  config: AppConfig | null
  profile: Profile | null
  setProfile: (p: Profile) => void
  reloadProfile: () => Promise<void>
  toast: string | null
  showToast: (message: string) => void
}

const AppContext = createContext<AppContextValue | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<number | undefined>(undefined)

  const reloadProfile = useCallback(async () => {
    setProfile(await api.profile())
  }, [])

  useEffect(() => {
    api.config().then(setConfig).catch(() => undefined)
    reloadProfile().catch(() => undefined)
  }, [reloadProfile])

  const showToast = useCallback((message: string) => {
    window.clearTimeout(toastTimer.current)
    setToast(message)
    toastTimer.current = window.setTimeout(() => setToast(null), 2500)
  }, [])

  return (
    <AppContext.Provider value={{ config, profile, setProfile, reloadProfile, toast, showToast }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
