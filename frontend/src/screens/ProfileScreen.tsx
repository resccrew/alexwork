import { useEffect, useState } from 'react'
import { api } from '../api'
import { useApp } from '../context/AppContext'
import { Avatar } from '../components/Avatar'
import { getTelegramUser, applyScheme, haptic } from '../telegram'
import type { Employment } from '../types'
import { Wallet, Percent, Clock, Building2, SunMoon, Check, CalendarDays } from 'lucide-react'

const EMPLOYMENT_OPTIONS: { id: Employment; label: string }[] = [
  { id: 'etat', label: 'Etat' },
  { id: 'part', label: 'Część etatu' },
  { id: 'kontrakt', label: 'Kontrakt' },
]

export function ProfileScreen() {
  const { config, profile, setProfile, showToast } = useApp()
  const [rate, setRate] = useState('')
  const [norm, setNorm] = useState('')
  const [dyzurBonus, setDyzurBonus] = useState('')
  const [nightBonus, setNightBonus] = useState('')
  
  const [isDark, setIsDark] = useState(false)
  const [savedField, setSavedField] = useState<string | null>(null)

  useEffect(() => {
    if (!profile) return
    setRate(String(profile.rate))
    setNorm(String(profile.norm_hours))
    setDyzurBonus(String(profile.dyzur_bonus_pct))
    setNightBonus(String(profile.night_bonus_pct))
  }, [profile])

  useEffect(() => {
    setIsDark(document.documentElement.dataset.scheme === 'dark')
  }, [])

  const departments = config?.departments ?? []
  const telegramUser = getTelegramUser()

  const commit = async (fields: Record<string, unknown>, fieldName?: string) => {
    try {
      const updated = await api.updateProfile(fields)
      setProfile(updated)
      if (fieldName) {
        setSavedField(fieldName)
        setTimeout(() => setSavedField(null), 2500)
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Nie udało się zapisać')
    }
  }

  const toggleTheme = () => {
    haptic('light')
    const newTheme = isDark ? 'light' : 'dark'
    setIsDark(!isDark)
    applyScheme(newTheme, true)
  }

  if (!profile) {
    return (
      <div className="screen">
        <div className="center-loading">Ładowanie…</div>
      </div>
    )
  }

  const renderSaveIndicator = (field: string) => {
    if (savedField === field) {
      return (
        <div className="save-indicator" style={{ position: 'absolute', right: -28 }}>
          <Check size={18} strokeWidth={3} />
        </div>
      )
    }
    return null
  }

  return (
    <div className="screen">
      <div style={{ padding: '22px 18px 10px', display: 'flex', alignItems: 'center', gap: 14 }}>
        <Avatar size={56} />
        <div>
          <div className="eyebrow">profil</div>
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.3 }}>{telegramUser?.first_name ?? 'Lekarz'}</div>
        </div>
      </div>

      <div className="settings-section-title">Finanse</div>
      <div className="card" style={{ margin: '0 18px', padding: '6px 16px' }}>
        <div className="field-row" style={{ position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14 }}>
            <Wallet size={18} color="var(--muted)" />
            <span>Stawka, zł/g</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
            <input
              type="number" value={rate} onChange={(e) => setRate(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
              onBlur={() => commit({ rate: Number(rate) || 0 }, 'rate')} style={{ width: 80 }}
            />
            {renderSaveIndicator('rate')}
          </div>
        </div>
        <div className="field-row" style={{ position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14 }}>
            <Percent size={18} color="var(--dyzur)" />
            <span>Dodatek za dyżur, %</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
            <input
              type="number" value={dyzurBonus} onChange={(e) => setDyzurBonus(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
              onBlur={() => commit({ dyzur_bonus_pct: Number(dyzurBonus) || 0 }, 'dyzurBonus')} style={{ width: 80 }}
            />
            {renderSaveIndicator('dyzurBonus')}
          </div>
        </div>
        <div className="field-row" style={{ position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14 }}>
            <Percent size={18} color="#A78BFA" />
            <span>Dodatek za nocne, %</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
            <input
              type="number" value={nightBonus} onChange={(e) => setNightBonus(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
              onBlur={() => commit({ night_bonus_pct: Number(nightBonus) || 0 }, 'nightBonus')} style={{ width: 80 }}
            />
            {renderSaveIndicator('nightBonus')}
          </div>
        </div>
      </div>

      <div className="settings-section-title">Zatrudnienie</div>
      <div className="card" style={{ margin: '0 18px', padding: '6px 16px' }}>
        <div className="field-row" style={{ position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14 }}>
            <Clock size={18} color="var(--muted)" />
            <span>Miesięczna norma, g</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
            <input
              type="number" value={norm} onChange={(e) => setNorm(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
              onBlur={() => commit({ norm_hours: Number(norm) || 0 }, 'norm')} style={{ width: 80 }}
            />
            {renderSaveIndicator('norm')}
          </div>
        </div>
        <div style={{ padding: '14px 0' }}>
          <div style={{ fontSize: 14, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span>Typ zatrudnienia</span>
          </div>
          <div className="segmented">
            {EMPLOYMENT_OPTIONS.map((o) => (
              <div
                key={o.id}
                className={`option${profile.employment === o.id ? ' selected' : ''}`}
                onClick={() => {
                  haptic('light')
                  commit({ employment: o.id })
                }}
              >
                {o.label}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="settings-section-title">Preferencje</div>
      <div className="card" style={{ margin: '0 18px', padding: '6px 16px' }}>
        <div style={{ padding: '14px 0', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: 14, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
            <Building2 size={18} color="var(--muted)" />
            <span>Domyślny oddział</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {departments.map((d) => (
              <div
                key={d}
                className={`list-option${profile.default_oddzial === d ? ' selected' : ''}`}
                onClick={() => {
                  haptic('light')
                  commit({ default_oddzial: d })
                }}
              >
                <span>{d}</span>
                {profile.default_oddzial === d && <span style={{ fontSize: 12, color: 'var(--muted)' }}>domyślnie</span>}
              </div>
            ))}
          </div>
        </div>

        <div className="field-row">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14 }}>
            <SunMoon size={18} color="var(--muted)" />
            <span>Ciemny motyw</span>
          </div>
          <label className="ios-toggle">
            <input type="checkbox" checked={isDark} onChange={toggleTheme} />
            <span className="slider"></span>
          </label>
        </div>
      </div>

      <div className="settings-section-title">Integracje</div>
      <div className="card" style={{ margin: '0 18px', padding: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14 }}>
            <CalendarDays size={18} color={profile.gcal_refresh_token ? "var(--work)" : "var(--muted)"} />
            <span>Google Calendar</span>
          </div>
          
          {profile.gcal_refresh_token ? (
            <button 
              onClick={async () => {
                haptic('light')
                try {
                  await api.disconnectGoogle()
                  setProfile({ ...profile, gcal_refresh_token: null })
                  showToast('Odłączono kalendarz')
                } catch (e) {
                  showToast('Błąd')
                }
              }}
              style={{ fontSize: 13, color: 'var(--dyzur)', fontWeight: 600 }}
            >
              Odłącz
            </button>
          ) : (
            <button 
              onClick={() => {
                haptic('light')
                // WebApp API to open link or just window.location
                if (window.Telegram?.WebApp) {
                    window.location.href = `/api/google/login?initData=${encodeURIComponent(window.Telegram.WebApp.initData)}`
                }
              }}
              style={{ fontSize: 13, color: 'var(--work)', fontWeight: 600 }}
            >
              Połącz
            </button>
          )}
        </div>
      </div>

      <div style={{ textAlign: 'center', padding: '32px 0 20px', fontSize: 12, color: 'var(--muted)' }}>
        MedApp · śledzenie zmian · v1.0
      </div>
    </div>
  )
}
