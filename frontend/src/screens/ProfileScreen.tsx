import { useEffect, useState } from 'react'
import { api } from '../api'
import { useApp } from '../context/AppContext'
import type { Employment } from '../types'

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

  useEffect(() => {
    if (!profile) return
    setRate(String(profile.rate))
    setNorm(String(profile.norm_hours))
    setDyzurBonus(String(profile.dyzur_bonus_pct))
    setNightBonus(String(profile.night_bonus_pct))
  }, [profile])

  const departments = config?.departments ?? []

  const commit = async (fields: Record<string, unknown>) => {
    try {
      const updated = await api.updateProfile(fields)
      setProfile(updated)
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Не удалось сохранить')
    }
  }

  if (!profile) {
    return (
      <div className="screen">
        <div className="center-loading">Загрузка…</div>
      </div>
    )
  }

  return (
    <div className="screen">
      <div style={{ padding: '22px 18px 10px', display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--surface2)', border: '1px solid var(--border)' }} />
        <div>
          <div className="eyebrow">профиль</div>
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.3 }}>Врач</div>
        </div>
      </div>

      <div className="card" style={{ margin: '8px 18px', padding: '6px 16px' }}>
        <div className="field-row">
          <div style={{ fontSize: 14 }}>Ставка, zł/ч</div>
          <input
            type="number" value={rate} onChange={(e) => setRate(e.target.value)}
            onBlur={() => commit({ rate: Number(rate) || 0 })} style={{ width: 80 }}
          />
        </div>
        <div className="field-row">
          <div style={{ fontSize: 14 }}>Месячная норма, ч</div>
          <input
            type="number" value={norm} onChange={(e) => setNorm(e.target.value)}
            onBlur={() => commit({ norm_hours: Number(norm) || 0 })} style={{ width: 80 }}
          />
        </div>
        <div className="field-row">
          <div style={{ fontSize: 14 }}>Надбавка за dyżur, %</div>
          <input
            type="number" value={dyzurBonus} onChange={(e) => setDyzurBonus(e.target.value)}
            onBlur={() => commit({ dyzur_bonus_pct: Number(dyzurBonus) || 0 })} style={{ width: 80 }}
          />
        </div>
        <div className="field-row">
          <div style={{ fontSize: 14 }}>Надбавка за ночные, %</div>
          <input
            type="number" value={nightBonus} onChange={(e) => setNightBonus(e.target.value)}
            onBlur={() => commit({ night_bonus_pct: Number(nightBonus) || 0 })} style={{ width: 80 }}
          />
        </div>
        <div style={{ padding: '14px 0', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: 14, marginBottom: 10 }}>Тип занятости</div>
          <div className="segmented">
            {EMPLOYMENT_OPTIONS.map((o) => (
              <div
                key={o.id}
                className={`option${profile.employment === o.id ? ' selected' : ''}`}
                onClick={() => commit({ employment: o.id })}
              >
                {o.label}
              </div>
            ))}
          </div>
        </div>
        <div style={{ padding: '14px 0' }}>
          <div style={{ fontSize: 14, marginBottom: 10 }}>Отделение по умолчанию</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {departments.map((d) => (
              <div
                key={d}
                className={`list-option${profile.default_oddzial === d ? ' selected' : ''}`}
                onClick={() => commit({ default_oddzial: d })}
              >
                <span>{d}</span>
                {profile.default_oddzial === d && <span style={{ fontSize: 12, color: 'var(--muted)' }}>по умолчанию</span>}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ textAlign: 'center', padding: '20px 0', fontSize: 12, color: 'var(--muted)' }}>
        MedApp · трекер смен · v1.0
      </div>
    </div>
  )
}
