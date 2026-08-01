import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Clock, Moon, Activity, Building2 } from 'lucide-react'
import { api } from '../api'
import { useApp } from '../context/AppContext'
import { Avatar } from '../components/Avatar'
import type { Shift, ShiftKind, Summary } from '../types'
import { haptic, notifyHaptic } from '../telegram'
import { fmtHours, fmtTime, monthLabel, pad } from '../format'

export function ShiftScreen() {
  const { config, profile, showToast } = useApp()
  const [status, setStatus] = useState<Shift | null | undefined>(undefined)
  const [summary, setSummary] = useState<Summary | null>(null)
  const [upcoming, setUpcoming] = useState<Shift[]>([])
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pendingKind, setPendingKind] = useState<ShiftKind>('work')
  const [pendingDept, setPendingDept] = useState('')
  const [lastChoice, setLastChoice] = useState<{ kind: ShiftKind; oddzial: string }>({ kind: 'work', oddzial: '' })
  const [confirmStart, setConfirmStart] = useState<{ kind: ShiftKind; oddzial: string } | null>(null)
  const [tick, setTick] = useState(() => Date.now())
  const [busy, setBusy] = useState(false)

  const departments = useMemo(() => config?.departments ?? [], [config])
  const now = new Date()

  useEffect(() => {
    api.status().then(setStatus).catch(() => setStatus(null))
    api.summary(now.getFullYear(), now.getMonth() + 1).then(setSummary).catch(() => undefined)
    api.upcomingShifts().then(setUpcoming).catch(() => setUpcoming([]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!status) return
    const id = window.setInterval(() => setTick(Date.now()), 15000)
    return () => window.clearInterval(id)
  }, [status])

  useEffect(() => {
    if (!lastChoice.oddzial) {
      const initial = profile?.default_oddzial ?? departments[0]
      if (initial) setLastChoice((c) => ({ ...c, oddzial: initial }))
    }
  }, [profile, departments, lastChoice.oddzial])

  const greeting = useMemo(() => {
    const h = new Date(tick).getHours()
    if (h < 5) return 'Dobrej nocy'
    if (h < 12) return 'Dzień dobry'
    if (h < 18) return 'Dzień dobry'
    return 'Dobry wieczór'
  }, [tick])

  const reloadSummary = () => {
    const n = new Date()
    api.summary(n.getFullYear(), n.getMonth() + 1).then(setSummary).catch(() => undefined)
    api.upcomingShifts().then(setUpcoming).catch(() => setUpcoming([]))
  }

  const openPicker = () => {
    haptic('light')
    setPendingKind(lastChoice.kind)
    setPendingDept(lastChoice.oddzial || departments[0] || '')
    setPickerOpen(true)
  }

  const startShift = async (kind: ShiftKind, oddzial: string) => {
    if (!oddzial || busy) return
    setBusy(true)
    try {
      const s = await api.startShift(kind, oddzial)
      setStatus(s)
      setLastChoice({ kind, oddzial })
      setPickerOpen(false)
      notifyHaptic('success')
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Nie udało się rozpocząć zmiany')
    } finally {
      setBusy(false)
    }
  }

  const stopShift = async () => {
    if (busy) return
    setBusy(true)
    try {
      const closed = await api.stopShift()
      setStatus(null)
      notifyHaptic('success')
      showToast(`Zmiana zakończona · ${fmtHours(closed.hours ?? 0)} g`)
      reloadSummary()
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Nie udało się zakończyć zmiany')
    } finally {
      setBusy(false)
    }
  }

  const onCircleTap = () => {
    if (status) {
      stopShift()
      return
    }
    if (pickerOpen) {
      startShift(pendingKind, pendingDept)
      return
    }
    openPicker()
  }

  if (status === undefined) {
    return (
      <div className="screen">
        <div className="center-loading">Ładowanie…</div>
      </div>
    )
  }

  const elapsedMs = status ? tick - new Date(status.start).getTime() : 0
  const elapsedH = Math.floor(elapsedMs / 3600000)
  const elapsedM = Math.floor((elapsedMs % 3600000) / 60000)
  const showForgotWarning = !!status && elapsedMs > 24 * 3600000
  const ringColor = status?.kind === 'dyzur' ? 'var(--dyzur)' : 'var(--praca)'

  return (
    <div className="screen">
      <div className="header">
        <div>
          <div className="eyebrow">{greeting}</div>
          <div className="title">Zmiana</div>
        </div>
        <Avatar />
      </div>

      {showForgotWarning && (
        <div
          style={{
            margin: '12px 18px 0', background: 'var(--warn-soft)', border: '1px solid var(--warn)',
            borderRadius: 14, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8,
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 600 }}>Wygląda na to, że zmiana nie jest zamknięta</div>
          <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.4 }}>
            Trwa ponad 24 godziny. Sprawdź i popraw czas zakończenia w Historii.
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 18px 0' }}>
        <div style={{ position: 'relative', width: 260, height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          
          {/* Animated decorative rings */}
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 40, ease: 'linear' }}
            style={{
              position: 'absolute', width: 250, height: 250, borderRadius: '50%',
              border: '1.5px dashed var(--border)', opacity: 0.3
            }}
          />
          <motion.div
            animate={{ rotate: -360 }}
            transition={{ repeat: Infinity, duration: 25, ease: 'linear' }}
            style={{
              position: 'absolute', width: 216, height: 216, borderRadius: '50%',
              border: '1px solid var(--border)', opacity: 0.5
            }}
          />
          
          {/* Pulse glow when active */}
          {status && (
            <div
              style={{
                position: 'absolute', width: 190, height: 190, borderRadius: '50%',
                background: ringColor, opacity: 0.25, animation: 'pulseRing 2s ease-out infinite',
              }}
            />
          )}
          
          {/* Main Button */}
          <motion.button
            whileTap={{ scale: 0.94 }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            onClick={onCircleTap}
            disabled={busy}
            style={{
              width: 164, height: 164, borderRadius: '50%',
              border: status ? 'none' : '1px solid var(--border)',
              background: status 
                ? 'var(--chrome)' 
                : 'linear-gradient(145deg, var(--surface), var(--bg))',
              boxShadow: status
                ? `0 12px 32px -8px ${ringColor}`
                : '0 8px 24px -10px rgba(0,0,0,0.3), inset 0 2px 4px rgba(255,255,255,0.03)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', gap: 4, position: 'relative', zIndex: 1, textAlign: 'center',
              color: status ? 'var(--chrome-text)' : 'var(--text)',
            }}
          >
            {status ? (
              <>
                <div style={{ fontSize: 32, fontWeight: 800, fontVariantNumeric: 'tabular-nums', letterSpacing: -1, lineHeight: 1 }}>
                  {elapsedH}:{pad(elapsedM)}
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.7, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 4 }}>
                  {status.kind === 'work' ? 'Praca' : 'Dyżur'}
                </div>
              </>
            ) : (
              <div style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.3, color: 'var(--text)' }}>
                Rozpocznij<br />zmianę
              </div>
            )}
          </motion.button>
        </div>
        {status && (
          <div style={{ marginTop: 10, fontSize: 13, color: 'var(--muted)' }}>
            Początek o {fmtTime(status.start)} · naciśnij koło, aby zakończyć
          </div>
        )}
      </div>

      {pickerOpen && !status && (
        <div className="card" style={{ margin: '10px 18px 0', animation: 'fadeUp .18s ease-out' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)', marginBottom: 8 }}>Typ zmiany</div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            <button
              style={{
                flex: 1, textAlign: 'center', padding: '9px 0', borderRadius: 10, fontSize: 13, fontWeight: 600,
                cursor: 'pointer', border: `1px solid ${pendingKind === 'work' ? 'var(--praca)' : 'var(--border)'}`,
                background: pendingKind === 'work' ? 'var(--praca-soft)' : 'var(--surface2)',
                color: pendingKind === 'work' ? 'var(--praca)' : 'var(--muted)',
              }}
              onClick={() => setPendingKind('work')}
            >
              Praca
            </button>
            <button
              style={{
                flex: 1, textAlign: 'center', padding: '9px 0', borderRadius: 10, fontSize: 13, fontWeight: 600,
                cursor: 'pointer', border: `1px solid ${pendingKind === 'dyzur' ? 'var(--dyzur)' : 'var(--border)'}`,
                background: pendingKind === 'dyzur' ? 'var(--dyzur-soft)' : 'var(--surface2)',
                color: pendingKind === 'dyzur' ? 'var(--dyzur)' : 'var(--muted)',
              }}
              onClick={() => setPendingKind('dyzur')}
            >
              Dyżur
            </button>
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)', marginBottom: 8 }}>Oddział</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
            {departments.map((d) => (
              <div key={d} className={`list-option${pendingDept === d ? ' selected' : ''}`} onClick={() => setPendingDept(d)}>
                <span>{d}</span>
                {pendingDept === d && <span style={{ fontSize: 12, color: 'var(--muted)' }}>wybrano</span>}
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setPickerOpen(false)}>
              Anuluj
            </button>
            <button
              className="btn btn-primary"
              style={{ flex: 2 }}
              disabled={busy || !pendingDept}
              onClick={() => startShift(pendingKind, pendingDept)}
            >
              Rozpocznij
            </button>
          </div>
        </div>
      )}

      {summary && (
        <div style={{ margin: '24px 18px 12px' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>Podsumowanie miesiąca</span>
            <span style={{ color: 'var(--muted)', fontWeight: 500 }}>{monthLabel(now.getFullYear(), now.getMonth() + 1)}</span>
          </div>
          <div className="card" style={{ display: 'flex', padding: '16px 8px', gap: 8, alignItems: 'center' }}>
            <MiniStat label="Godziny" value={fmtHours(summary.total_hours)} icon={Clock} color="var(--chrome)" />
            <div style={{ width: 1, height: 32, background: 'var(--border)' }} />
            <MiniStat label="Dyżury" value={fmtHours(summary.dyzur_hours)} icon={Activity} color="var(--dyzur)" />
            <div style={{ width: 1, height: 32, background: 'var(--border)' }} />
            <MiniStat label="Nocne" value={fmtHours(summary.night_hours)} icon={Moon} color="#A78BFA" />
          </div>
        </div>
      )}

      {!status && !pickerOpen && departments.length > 0 && (
        <div style={{ margin: '16px 18px 32px' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>
            Szybki start
          </div>
          <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 24, paddingTop: 8, paddingLeft: 4, paddingRight: 4, marginLeft: -4, marginRight: -4 }}>
            {departments.map((d) => {
              const primary = d === lastChoice.oddzial
              return (
                <motion.div
                  whileTap={{ scale: 0.95 }}
                  key={d}
                  onClick={() => setConfirmStart({ kind: lastChoice.kind, oddzial: d })}
                  style={{
                    minWidth: 140, 
                    background: primary ? 'color-mix(in srgb, var(--chrome) 12%, transparent)' : 'var(--surface2)',
                    border: `1px solid ${primary ? 'var(--chrome)' : 'var(--border)'}`,
                    borderRadius: 20, padding: '16px', display: 'flex', flexDirection: 'column', gap: 14, cursor: 'pointer',
                    boxShadow: primary ? '0 4px 16px color-mix(in srgb, var(--chrome) 20%, transparent)' : '0 2px 8px rgba(0,0,0,0.05)'
                  }}
                >
                  <div
                    style={{
                      width: 42, height: 42, borderRadius: 12,
                      background: primary ? 'var(--chrome)' : 'var(--surface)',
                      color: primary ? 'var(--bg)' : 'var(--muted)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      border: primary ? 'none' : '1px solid var(--border)',
                      boxShadow: primary ? '0 4px 12px rgba(0,0,0,0.15)' : 'none'
                    }}
                  >
                    <Building2 size={20} strokeWidth={2.5} />
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: primary ? 'var(--chrome)' : 'var(--text)', whiteSpace: 'nowrap', marginBottom: 2 }}>
                      {d}
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: primary ? 'var(--chrome)' : 'var(--muted)', opacity: 0.8 }}>
                      Rozpocznij
                    </div>
                  </div>
                </motion.div>
              )
            })}
          </div>
        </div>
      )}

      {/* Upcoming Shifts Section */}
      <div style={{ margin: '16px 18px 32px' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>
          Najbliższe zmiany
        </div>
        {upcoming.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {upcoming.map(s => {
              const uDate = new Date(s.start)
              const dateStr = uDate.toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' })
              return (
                <div key={s.id} className="card" style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: 10,
                    background: s.kind === 'dyzur' ? 'var(--dyzur-soft)' : 'var(--praca-soft)',
                    color: s.kind === 'dyzur' ? 'var(--dyzur)' : 'var(--praca)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}>
                    {s.kind === 'dyzur' ? <Moon size={20} /> : <Building2 size={20} />}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--text)' }}>{s.oddzial}</div>
                    <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>{dateStr}, {fmtTime(s.start)}</div>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="card" style={{ padding: '24px 16px', textAlign: 'center', background: 'var(--surface2)', border: '1px dashed var(--border)' }}>
            <div style={{ color: 'var(--text)', fontSize: 14, fontWeight: 600 }}>
              Brak zaplanowanych zmian
            </div>
            <div style={{ color: 'var(--muted)', fontSize: 13, marginTop: 4 }}>
              Przyszłe zmiany pojawią się tutaj
            </div>
          </div>
        )}
      </div>

      {confirmStart && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 100,
          background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="card"
            style={{ width: 280, padding: '24px 20px', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 16, margin: '0 20px' }}
          >
            <div style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.3, color: 'var(--text)' }}>Rozpocząć zmianę?</div>
            <div style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.4 }}>
              Czy na pewno chcesz rozpocząć zmianę <br />
              <b style={{ color: 'var(--text)' }}>{confirmStart.kind === 'work' ? 'Praca' : 'Dyżur'}</b> w oddziale <b style={{ color: 'var(--text)' }}>{confirmStart.oddzial}</b>?
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setConfirmStart(null)}>Anuluj</button>
              <button className="btn btn-primary" style={{ flex: 1, background: 'var(--chrome)', color: 'var(--bg)' }} onClick={() => {
                startShift(confirmStart.kind, confirmStart.oddzial)
                setConfirmStart(null)
              }}>Rozpocznij</button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  )
}

function MiniStat({ label, value, icon: Icon, color }: { label: string; value: string; icon: any; color: string }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--muted)' }}>
        <Icon size={14} color={color} />
        <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</span>
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, fontVariantNumeric: 'tabular-nums', letterSpacing: -0.5, color: 'var(--text)' }}>
        {value}
      </div>
    </div>
  )
}
