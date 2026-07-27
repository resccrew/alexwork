export type TabId = 'shift' | 'history' | 'summary' | 'profile'

const TABS: { id: TabId; label: string; shape: 'circle' | 'square'; filled: boolean }[] = [
  { id: 'shift', label: 'Смена', shape: 'circle', filled: true },
  { id: 'history', label: 'История', shape: 'square', filled: false },
  { id: 'summary', label: 'Итоги', shape: 'square', filled: true },
  { id: 'profile', label: 'Профиль', shape: 'circle', filled: false },
]

export function TabBar({ active, onChange }: { active: TabId; onChange: (id: TabId) => void }) {
  return (
    <div className="tabbar">
      <div className="tabbar-inner">
        {TABS.map((t) => {
          const isActive = active === t.id
          return (
            <button key={t.id} className={`tab${isActive ? ' active' : ''}`} onClick={() => onChange(t.id)}>
              <span className={`tab-icon ${t.shape}${isActive && t.filled ? ' filled' : ''}`} />
              <span className="tab-label">{t.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
