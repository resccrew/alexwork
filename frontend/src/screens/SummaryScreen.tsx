import { useEffect, useState } from 'react'
import { api } from '../api'
import { useApp } from '../context/AppContext'
import type { Summary } from '../types'
import { fmtHours, fmtMoney, monthLabel, shiftMonth } from '../format'

export function SummaryScreen() {
  const { profile, showToast } = useApp()
  const [monthOffset, setMonthOffset] = useState(0)
  const [summary, setSummary] = useState<Summary | null>(null)
  const [mode, setMode] = useState<'simple' | 'bonus'>('simple')
  const [downloading, setDownloading] = useState(false)

  const base = new Date()
  const { year, month } = shiftMonth(base.getFullYear(), base.getMonth() + 1, monthOffset)

  useEffect(() => {
    api.summary(year, month).then(setSummary).catch(() => setSummary(null))
  }, [year, month])

  const download = async () => {
    setDownloading(true)
    try {
      await api.downloadReport(year, month)
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Не удалось скачать отчёт')
    } finally {
      setDownloading(false)
    }
  }

  const maxMinutes = Math.max(1, ...(summary?.days.map((d) => d.minutes) ?? [1]))

  return (
    <div className="screen">
      <div className="header">
        <div>
          <div className="eyebrow">итоги</div>
          <div className="title">{summary ? `${fmtHours(summary.total_hours)} ч` : '…'}</div>
        </div>
        <div className="avatar" />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 18, padding: '16px 22px 2px' }}>
        <div style={{ fontSize: 15, fontWeight: 600, textTransform: 'capitalize' }}>{monthLabel(year, month)}</div>
        <div style={{ flex: 1 }} />
        <button style={navBtnStyle} onClick={() => setMonthOffset((o) => o - 1)}>‹</button>
        <button style={navBtnStyle} onClick={() => setMonthOffset((o) => o + 1)}>›</button>
      </div>

      <div style={{ display: 'flex', padding: '12px 22px 0', height: 118 }}>
        {summary && summary.days.length > 0 ? (
          summary.days.map((d) => (
            <div key={d.day} style={{ flex: 1, position: 'relative', height: '100%' }}>
              <div
                style={{
                  position: 'absolute', left: '50%', transform: 'translateX(-50%)', bottom: 0,
                  width: 5, height: `${Math.max(6, Math.round((d.minutes / maxMinutes) * 100))}%`,
                  minHeight: 6, borderRadius: 4, background: d.has_dyzur ? 'var(--dyzur)' : 'var(--text)',
                }}
              />
            </div>
          ))
        ) : (
          <div style={{ flex: 1, textAlign: 'center', color: 'var(--muted)', fontSize: 13, alignSelf: 'center' }}>
            Нет данных за период
          </div>
        )}
      </div>
      <div style={{ borderTop: '1px solid var(--border)', margin: '0 22px' }} />

      <div style={{ display: 'flex', gap: 10, padding: '16px 18px 0', overflowX: 'auto' }}>
        <StatCard primary label="всего часов" value={summary ? fmtHours(summary.total_hours) : '—'} />
        <StatCard label="praca" value={summary ? fmtHours(summary.praca_hours) : '—'} />
        <StatCard label="dyżury" value={summary ? fmtHours(summary.dyzur_hours) : '—'} />
        <StatCard label="ночных" value={summary ? fmtHours(summary.night_hours) : '—'} />
        <StatCard label="переработка" value={summary ? fmtHours(summary.overtime_hours) : '—'} />
      </div>

      <div className="card" style={{ margin: '16px 18px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)' }}>Заработок</div>
          <div style={{ display: 'flex', background: 'var(--surface2)', borderRadius: 10, padding: 2 }}>
            <button
              onClick={() => setMode('simple')}
              style={{
                padding: '6px 10px', fontSize: 12, fontWeight: 600, borderRadius: 8, cursor: 'pointer', border: 'none',
                color: mode === 'simple' ? 'var(--text)' : 'var(--muted)', background: mode === 'simple' ? 'var(--surface)' : 'transparent',
              }}
            >
              Без надбавок
            </button>
            <button
              onClick={() => setMode('bonus')}
              style={{
                padding: '6px 10px', fontSize: 12, fontWeight: 600, borderRadius: 8, cursor: 'pointer', border: 'none',
                color: mode === 'bonus' ? 'var(--text)' : 'var(--muted)', background: mode === 'bonus' ? 'var(--surface)' : 'transparent',
              }}
            >
              С надбавками
            </button>
          </div>
        </div>
        <div style={{ fontSize: 30, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
          {summary ? fmtMoney(mode === 'simple' ? summary.earnings_simple : summary.earnings_bonus) : '—'}
        </div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
          по ставке {profile?.rate ?? 0} zł/ч{mode === 'bonus' ? ' + надбавки за dyżur и ночные' : ''}
        </div>
      </div>

      <div style={{ padding: '16px 18px 8px' }}>
        <button className="btn btn-primary" style={{ width: '100%' }} disabled={downloading} onClick={download}>
          {downloading ? 'Готовим отчёт…' : 'Скачать отчёт (Excel)'}
        </button>
        <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>
          Отчёт уже готов — считать вручную не нужно
        </div>
      </div>
    </div>
  )
}

function StatCard({ label, value, primary }: { label: string; value: string; primary?: boolean }) {
  return (
    <div
      style={{
        minWidth: 118, background: primary ? 'var(--chrome)' : 'var(--surface)',
        border: primary ? 'none' : '1px solid var(--border)', borderRadius: 22, padding: '16px 14px',
        display: 'flex', flexDirection: 'column', gap: 10,
      }}
    >
      <div style={{ fontSize: 20, fontWeight: 700, color: primary ? 'var(--chrome-text)' : 'var(--text)', letterSpacing: -0.3 }}>
        {value}
      </div>
      <div style={{ fontSize: 12, color: primary ? 'var(--chrome-text)' : 'var(--muted)', opacity: primary ? 0.65 : 1 }}>
        {label}
      </div>
    </div>
  )
}

const navBtnStyle = {
  fontSize: 18, color: 'var(--muted)', cursor: 'pointer', padding: '2px 8px', background: 'transparent', border: 'none',
} as const
