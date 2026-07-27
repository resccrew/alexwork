import { useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import { useApp } from '../context/AppContext'
import type { Shift, ShiftKind, Summary } from '../types'
import { haptic, notifyHaptic } from '../telegram'
import { fmtHours, fmtTime, monthLabel, pad } from '../format'

export function ShiftScreen() {
  const { config, profile, showToast } = useApp()
  const [status, setStatus] = useState<Shift | null | undefined>(undefined)
  const [summary, setSummary] = useState<Summary | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pendingKind, setPendingKind] = useState<ShiftKind>('work')
  const [pendingDept, setPendingDept] = useState('')
  const [lastChoice, setLastChoice] = useState<{ kind: ShiftKind; oddzial: string }>({ kind: 'work', oddzial: '' })
  const [tick, setTick] = useState(() => Date.now())
  const [busy, setBusy] = useState(false)

  const departments = useMemo(() => config?.departments ?? [], [config])
  const now = new Date()

  useEffect(() => {
    api.status().then(setStatus).catch(() => setStatus(null))
    api.summary(now.getFullYear(), now.getMonth() + 1).then(setSummary).catch(() => undefined)
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
    if (h < 5) return 'Доброй ночи'
    if (h < 12) return 'Доброе утро'
    if (h < 18) return 'Добрый день'
    return 'Добрый вечер'
  }, [tick])

  const reloadSummary = () => {
    const n = new Date()
    api.summary(n.getFullYear(), n.getMonth() + 1).then(setSummary).catch(() => undefined)
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
      showToast(e instanceof Error ? e.message : 'Не удалось начать смену')
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
      showToast(`Смена завершена · ${fmtHours(closed.hours ?? 0)} ч`)
      reloadSummary()
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Не удалось закончить смену')
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
        <div className="center-loading">Загрузка…</div>
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
          <div className="title">Смена</div>
        </div>
        <div className="avatar" />
      </div>

      {showForgotWarning && (
        <div
          style={{
            margin: '12px 18px 0', background: 'var(--warn-soft)', border: '1px solid var(--warn)',
            borderRadius: 14, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8,
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 600 }}>Похоже, смена не закрыта</div>
          <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.4 }}>
            Идёт больше 24 часов. Проверьте и исправьте время окончания в Истории.
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '36px 18px 0' }}>
        <div style={{ position: 'relative', width: 236, height: 236, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ position: 'absolute', width: 236, height: 236, borderRadius: '50%', border: '1px solid var(--border)', opacity: 0.5 }} />
          <div style={{ position: 'absolute', width: 214, height: 214, borderRadius: '50%', border: '1px solid var(--border)', opacity: 0.7 }} />
          {status && (
            <div
              style={{
                position: 'absolute', width: 190, height: 190, borderRadius: '50%',
                background: ringColor, opacity: 0.25, animation: 'pulseRing 2.4s ease-out infinite',
              }}
            />
          )}
          <div style={{ position: 'absolute', width: 190, height: 190, borderRadius: '50%', background: 'var(--surface2)' }} />
          <button
            onClick={onCircleTap}
            disabled={busy}
            style={{
              width: 146, height: 146, borderRadius: '50%', border: 'none',
              background: status ? 'var(--chrome)' : 'var(--surface2)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', gap: 3, position: 'relative', zIndex: 1, textAlign: 'center', padding: '0 12px',
            }}
          >
            {status ? (
              <>
                <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--chrome-text)', fontVariantNumeric: 'tabular-nums', letterSpacing: -0.5 }}>
                  {elapsedH} ч {pad(elapsedM)} м
                </div>
                <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--chrome-text)', opacity: 0.7 }}>
                  {status.kind === 'work' ? 'Praca' : 'Dyżur'} · {status.oddzial}
                </div>
              </>
            ) : (
              <div style={{ fontSize: 17, fontWeight: 600, lineHeight: 1.3, color: 'var(--text)' }}>
                Начать
                <br />
                смену
              </div>
            )}
          </button>
        </div>
        {status && (
          <div style={{ marginTop: 10, fontSize: 13, color: 'var(--muted)' }}>
            Начало в {fmtTime(status.start)} · нажмите на круг, чтобы закончить
          </div>
        )}
      </div>

      {pickerOpen && !status && (
        <div className="card" style={{ margin: '10px 18px 0', animation: 'fadeUp .18s ease-out' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)', marginBottom: 8 }}>Тип смены</div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            <button
              className="segmented option"
              style={{
                flex: 1, background: pendingKind === 'work' ? 'var(--praca-soft)' : 'var(--surface2)',
                color: pendingKind === 'work' ? 'var(--praca)' : 'var(--muted)',
                borderColor: pendingKind === 'work' ? 'var(--praca)' : 'var(--border)',
              }}
              onClick={() => setPendingKind('work')}
            >
              Praca
            </button>
            <button
              className="segmented option"
              style={{
                flex: 1, background: pendingKind === 'dyzur' ? 'var(--dyzur-soft)' : 'var(--surface2)',
                color: pendingKind === 'dyzur' ? 'var(--dyzur)' : 'var(--muted)',
                borderColor: pendingKind === 'dyzur' ? 'var(--dyzur)' : 'var(--border)',
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
                {pendingDept === d && <span style={{ fontSize: 12, color: 'var(--muted)' }}>выбрано</span>}
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setPickerOpen(false)}>
              Отмена
            </button>
            <button
              className="btn btn-primary"
              style={{ flex: 2 }}
              disabled={busy || !pendingDept}
              onClick={() => startShift(pendingKind, pendingDept)}
            >
              Начать
            </button>
          </div>
        </div>
      )}

      {summary && (
        <>
          <div style={{ display: 'flex', padding: '22px 26px 4px' }}>
            <MiniStat label="часов" value={fmtHours(summary.total_hours)} />
            <MiniStat label="dyżury" value={fmtHours(summary.dyzur_hours)} />
            <MiniStat label="ночных" value={fmtHours(summary.night_hours)} />
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)', padding: '10px 26px 6px' }}>
            {monthLabel(now.getFullYear(), now.getMonth() + 1)}
          </div>
        </>
      )}

      {!status && !pickerOpen && departments.length > 0 && (
        <div style={{ display: 'flex', gap: 10, padding: '8px 18px 10px', overflowX: 'auto' }}>
          {departments.map((d) => {
            const primary = d === lastChoice.oddzial
            return (
              <div
                key={d}
                onClick={() => startShift(lastChoice.kind, d)}
                style={{
                  minWidth: 122, background: primary ? 'var(--chrome)' : 'var(--surface)',
                  border: `1px solid ${primary ? 'var(--chrome)' : 'var(--border)'}`,
                  borderRadius: 22, padding: '16px 14px', display: 'flex', flexDirection: 'column', gap: 12, cursor: 'pointer',
                }}
              >
                <div
                  style={{
                    width: 38, height: 38, borderRadius: 12,
                    border: `1px solid ${primary ? 'var(--chrome-text)' : 'var(--border)'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <div
                    style={{
                      width: 10, height: 10, borderRadius: '50%',
                      border: `1.5px solid ${primary ? 'var(--chrome-text)' : 'var(--text)'}`,
                    }}
                  />
                </div>
                <div style={{ fontSize: 11, color: primary ? 'var(--chrome-text)' : 'var(--muted)', whiteSpace: 'nowrap' }}>
                  {d}
                </div>
                <div style={{ fontSize: 12, fontWeight: 600, color: primary ? 'var(--chrome-text)' : 'var(--text)' }}>Начать</div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
      <div style={{ fontSize: 20, fontWeight: 700, fontVariantNumeric: 'tabular-nums', letterSpacing: -0.3 }}>{value}</div>
      <div style={{ fontSize: 13, color: 'var(--muted)' }}>{label}</div>
    </div>
  )
}
