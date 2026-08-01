import { Home, History, BarChart2, User } from 'lucide-react'

export type TabId = 'shift' | 'history' | 'summary' | 'profile'

const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: 'shift', label: 'Zmiana', icon: Home },
  { id: 'history', label: 'Historia', icon: History },
  { id: 'summary', label: 'Podsumowanie', icon: BarChart2 },
  { id: 'profile', label: 'Profil', icon: User },
]

export function TabBar({ active, onChange }: { active: TabId; onChange: (id: TabId) => void }) {
  const activeIndex = TABS.findIndex((t) => t.id === active)
  
  return (
    <div className="tabbar">
      <div className="tabbar-inner">
        {/* Animated Background Pill */}
        <div 
          className="tab-pill"
          style={{
            transform: `translateX(calc(${activeIndex * 100}% + ${activeIndex * 4}px))`
          }}
        />

        {TABS.map((t) => {
          const isActive = active === t.id
          const Icon = t.icon
          return (
            <button 
              key={t.id} 
              className={`tab${isActive ? ' active' : ''}`} 
              onClick={() => onChange(t.id)}
              style={{ position: 'relative' }}
            >
              <div className={`tab-icon-wrapper ${isActive ? 'is-active' : ''}`}>
                <Icon size={24} strokeWidth={isActive ? 2.5 : 2} className="tab-icon-svg" />
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
