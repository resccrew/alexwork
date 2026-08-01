import { useEffect, useState } from 'react'
import { api } from '../api'
import { useApp } from '../context/AppContext'
import { Avatar } from '../components/Avatar'
import type { Summary } from '../types'
import { fmtHours, fmtMoney, monthLabel, shiftMonth } from '../format'

export function SummaryScreen() {
  const { profile, showToast } = useApp()
  const [monthOffset, setMonthOffset] = useState(0)
  const [summary, setSummary] = useState<Summary | null>(null)
  const [mode, setMode] = useState<'simple' | 'bonus'>('simple')
  const [downloading, setDownloading] = useState(false)
  const [activeTooltip, setActiveTooltip] = useState<number | null>(null)

  const base = new Date()
  const { year, month } = shiftMonth(base.getFullYear(), base.getMonth() + 1, monthOffset)

  useEffect(() => {
    api.summary(year, month).then(setSummary).catch(() => setSummary(null))
    setActiveTooltip(null)
  }, [year, month])

  const download = async () => {
    setDownloading(true)
    try {
      await api.sendReport(year, month)
      showToast('Raport wysłany na czat bota')
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Nie udało się wysłać raportu')
    } finally {
      setDownloading(false)
    }
  }

  const daysInMonth = new Date(year, month, 0).getDate()
  const firstDay = new Date(year, month - 1, 1).getDay()
  const startOffset = firstDay === 0 ? 6 : firstDay - 1 // 0 for Monday

  const getDayColor = (minutes: number) => {
    if (minutes < 240) return 'var(--purple-1)'
    if (minutes < 480) return 'var(--purple-2)'
    if (minutes < 720) return 'var(--purple-3)'
    return 'var(--purple-4)'
  }

  const cells = []
  for (let i = 0; i < startOffset; i++) {
    cells.push(<div key={`empty-start-${i}`} style={{ width: 32, height: 32 }} />)
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const data = summary?.days.find((x) => x.day === d)
    const minutes = data?.minutes ?? 0
    const isActive = activeTooltip === d
    cells.push(
      <div 
        key={`day-${d}`} 
        style={{ 
          position: 'relative',
          width: 32, 
          height: 32, 
          borderRadius: 6, 
          background: minutes > 0 ? getDayColor(minutes) : 'var(--purple-0)',
          boxShadow: '0 0 0 1px rgba(0,0,0,0.04) inset',
          cursor: 'pointer'
        }} 
        onClick={() => setActiveTooltip(isActive ? null : d)}
      >
        {isActive && (
          <div style={{
            position: 'absolute',
            bottom: '100%',
            left: '50%',
            transform: 'translateX(-50%)',
            marginBottom: 6,
            padding: '6px 10px',
            background: 'var(--chrome)',
            color: 'var(--chrome-text)',
            borderRadius: 8,
            fontSize: 12,
            whiteSpace: 'nowrap',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            zIndex: 10,
            pointerEvents: 'none',
            lineHeight: 1.3
          }}>
            {data && data.shifts > 0 ? (
              <>
                <div style={{ fontWeight: 600 }}>{d} {monthLabel(year, month).split(' ')[0]}</div>
                <div style={{ opacity: 0.8 }}>{data.shifts} {data.shifts === 1 ? 'zmiana' : (data.shifts < 5 ? 'zmiany' : 'zmian')}, {Math.round((data.minutes / 60) * 10) / 10} g</div>
              </>
            ) : (
              <div>{d} {monthLabel(year, month).split(' ')[0]}: brak zmian</div>
            )}
            <div style={{
              position: 'absolute',
              top: '100%',
              left: '50%',
              transform: 'translateX(-50%)',
              border: '4px solid transparent',
              borderTopColor: 'var(--chrome)'
            }} />
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="screen">
      <div className="header">
        <div>
          <div className="eyebrow">podsumowanie</div>
          <div className="title">{summary ? `${fmtHours(summary.total_hours)} g` : '…'}</div>
        </div>
        <Avatar />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 18, padding: '16px 22px 2px' }}>
        <div style={{ fontSize: 15, fontWeight: 600, textTransform: 'capitalize' }}>{monthLabel(year, month)}</div>
        <div style={{ flex: 1 }} />
        <button style={navBtnStyle} onClick={() => setMonthOffset((o) => o - 1)}>‹</button>
        <button style={navBtnStyle} onClick={() => setMonthOffset((o) => o + 1)}>›</button>
      </div>

      <div style={{ display: 'flex', padding: '40px 22px 24px', justifyContent: 'center', gap: 12, overflowX: 'auto' }}>
        <div style={{ display: 'grid', gridTemplateRows: 'repeat(7, 32px)', gap: 6, fontSize: 13, color: 'var(--muted)', textAlign: 'right', lineHeight: '32px' }}>
          <div>Pn</div>
          <div style={{ visibility: 'hidden' }}>Wt</div>
          <div>Śr</div>
          <div style={{ visibility: 'hidden' }}>Cz</div>
          <div>Pt</div>
          <div style={{ visibility: 'hidden' }}>Sb</div>
          <div style={{ visibility: 'hidden' }}>Nd</div>
        </div>
        <div style={{ display: 'grid', gridTemplateRows: 'repeat(7, 32px)', gridAutoFlow: 'column', gap: 6 }}>
          {cells}
        </div>
      </div>
      <div style={{ borderTop: '1px solid var(--border)', margin: '0 22px' }} />

      <div style={{ display: 'flex', gap: 10, padding: '16px 18px 0', overflowX: 'auto' }}>
        <StatCard primary label="suma godzin" value={summary ? fmtHours(summary.total_hours) : '—'} />
        <StatCard label="praca" value={summary ? fmtHours(summary.praca_hours) : '—'} />
        <StatCard label="dyżury" value={summary ? fmtHours(summary.dyzur_hours) : '—'} />
        <StatCard label="nocne" value={summary ? fmtHours(summary.night_hours) : '—'} />
        <StatCard label="nadgodziny" value={summary ? fmtHours(summary.overtime_hours) : '—'} />
      </div>

      <div className="card" style={{ margin: '16px 18px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)' }}>Zarobki</div>
          <div style={{ display: 'flex', background: 'var(--surface2)', borderRadius: 10, padding: 2 }}>
            <button
              onClick={() => setMode('simple')}
              style={{
                padding: '6px 10px', fontSize: 12, fontWeight: 600, borderRadius: 8, cursor: 'pointer', border: 'none',
                color: mode === 'simple' ? 'var(--text)' : 'var(--muted)', background: mode === 'simple' ? 'var(--surface)' : 'transparent',
              }}
            >
              Bez dodatków
            </button>
            <button
              onClick={() => setMode('bonus')}
              style={{
                padding: '6px 10px', fontSize: 12, fontWeight: 600, borderRadius: 8, cursor: 'pointer', border: 'none',
                color: mode === 'bonus' ? 'var(--text)' : 'var(--muted)', background: mode === 'bonus' ? 'var(--surface)' : 'transparent',
              }}
            >
              Z dodatkami
            </button>
          </div>
        </div>
        <div style={{ fontSize: 30, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
          {summary ? fmtMoney(mode === 'simple' ? summary.earnings_simple : summary.earnings_bonus) : '—'}
        </div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
          ze stawką {profile?.rate ?? 0} zł/g{mode === 'bonus' ? ' + dodatki za dyżur i nocne' : ''}
        </div>
      </div>

      <div style={{ padding: '16px 18px 8px' }}>
        <button className="btn btn-primary" style={{ width: '100%' }} disabled={downloading} onClick={download}>
          {downloading ? 'Wysyłanie…' : 'Wyślij raport (Excel)'}
        </button>
        <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>
          Przyjdzie plikiem na czat bota — nie trzeba liczyć ręcznie
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
