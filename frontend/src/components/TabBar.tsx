import { Home, History, BarChart2, User } from 'lucide-react'
import { motion } from 'framer-motion'

export type TabId = 'shift' | 'history' | 'summary' | 'profile'

const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: 'shift', label: 'Смена', icon: Home },
  { id: 'history', label: 'История', icon: History },
  { id: 'summary', label: 'Итоги', icon: BarChart2 },
  { id: 'profile', label: 'Профиль', icon: User },
]

export function TabBar({ active, onChange }: { active: TabId; onChange: (id: TabId) => void }) {
  return (
    <div className="tabbar">
      <div className="tabbar-inner">
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
              {isActive && (
                <motion.div
                  layoutId="activeTabPill"
                  style={{
                    position: 'absolute',
                    inset: 0,
                    backgroundColor: 'var(--chrome)',
                    borderRadius: 14,
                    zIndex: 0
                  }}
                  transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                />
              )}
              <motion.div
                style={{ zIndex: 1, position: 'relative', display: 'flex' }}
                animate={{ scale: isActive ? 1.15 : 1 }}
                whileTap={{ scale: 0.9 }}
                transition={{ type: 'spring', stiffness: 500, damping: 25 }}
              >
                <Icon size={24} strokeWidth={isActive ? 2.5 : 2} className="tab-icon-svg" />
              </motion.div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
