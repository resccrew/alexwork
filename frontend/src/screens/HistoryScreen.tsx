import { useEffect, useState } from 'react'
import { api } from '../api'
import { useApp } from '../context/AppContext'
import type { Shift } from '../types'
import { ShiftEditForm } from '../components/ShiftEditForm'
import type { ShiftDraft } from '../components/ShiftEditForm'
import { fmtHours, fmtTime, monthLabel, shiftMonth } from '../format'

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function isoTime(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function toDraft(s: Shift): ShiftDraft {
  const start = new Date(s.start)
  const end = s.end ? new Date(s.end) : start
  return {
    id: s.id, kind: s.kind, oddzial: s.oddzial,
    date: isoDate(start), start: isoTime(start), end: isoTime(end),
  }
}

function toLocalIso(d: Date): string {
  const tzOffsetMin = -d.getTimezoneOffset()
  const sign = tzOffsetMin >= 0 ? '+' : '-'
  const abs = Math.abs(tzOffsetMin)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
}

function draftToPayload(draft: ShiftDraft) {
  const [y, m, d] = draft.date.split('-').map(Number)
  const [sh, sm] = draft.start.split(':').map(Number)
  const [eh, em] = draft.end.split(':').map(Number)
  const startDate = new Date(y, m - 1, d, sh, sm)
  let endDate = new Date(y, m - 1, d, eh, em)
  if (endDate <= startDate) endDate = new Date(endDate.getTime() + 24 * 3600000)
  return { kind: draft.kind, oddzial: draft.oddzial, start: toLocalIso(startDate), end: toLocalIso(endDate) }
}

function groupByDay(shifts: Shift[]): [string, Shift[]][] {
  const map = new Map<string, Shift[]>()
  for (const s of shifts) {
    const key = s.start.slice(0, 10)
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(s)
  }
  return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1))
}

function dayLabel(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`)
  return d.toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' })
}

export function HistoryScreen() {
  const { config, profile, showToast } = useApp()
  const [monthOffset, setMonthOffset] = useState(0)
  const [shifts, setShifts] = useState<Shift[] | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [draft, setDraft] = useState<ShiftDraft | null>(null)
  const [addingNew, setAddingNew] = useState(false)
  const [busy, setBusy] = useState(false)

  const base = new Date()
  const { year, month } = shiftMonth(base.getFullYear(), base.getMonth() + 1, monthOffset)
  const departments = config?.departments ?? []

  const load = () => {
    api.listShifts(year, month).then(setShifts).catch(() => setShifts([]))
  }

  useEffect(() => {
    load()
    setEditingId(null)
    setAddingNew(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month])

  const openEdit = (s: Shift) => {
    setAddingNew(false)
    setEditingId(s.id)
    setDraft(toDraft(s))
  }

  const openAddNew = () => {
    setEditingId(null)
    setAddingNew(true)
    const today = new Date(year, month - 1, Math.min(base.getDate(), 28))
    setDraft({
      kind: 'work',
      oddzial: profile?.default_oddzial ?? departments[0] ?? '',
      date: isoDate(today),
      start: '07:00',
      end: '15:00',
    })
  }

  const cancelEdit = () => {
    setEditingId(null)
    setAddingNew(false)
    setDraft(null)
  }

  const saveDraft = async () => {
    if (!draft) return
    setBusy(true)
    try {
      const payload = draftToPayload(draft)
      if (addingNew) {
        await api.createShift(payload)
        showToast('Zmiana dodana')
      } else if (draft.id) {
        await api.updateShift(draft.id, payload)
        showToast('Zmiany zapisane')
      }
      cancelEdit()
      load()
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Nie udało się zapisać')
    } finally {
      setBusy(false)
    }
  }

  const deleteShift = async () => {
    if (!draft?.id) return
    setBusy(true)
    try {
      await api.deleteShift(draft.id)
      showToast('Zmiana usunięta')
      cancelEdit()
      load()
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Nie udało się usunąć')
    } finally {
      setBusy(false)
    }
  }

  const grouped = groupByDay(shifts ?? [])

  return (
    <div className="screen">
      <div className="header">
        <div>
          <div className="eyebrow">historia</div>
          <div className="title">{shifts ? `${shifts.length} zmian` : '…'}</div>
        </div>
        <button
          onClick={openAddNew}
          style={{
            fontSize: 13, fontWeight: 600, color: 'var(--text)', cursor: 'pointer', padding: '10px 14px',
            borderRadius: 20, border: '1px solid var(--border)', whiteSpace: 'nowrap', background: 'transparent',
          }}
        >
          + dodaj wpis
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 18, padding: '14px 18px' }}>
        <button style={navBtnStyle} onClick={() => setMonthOffset((o) => o - 1)}>‹</button>
        <div style={{ fontSize: 15, fontWeight: 600, minWidth: 150, textAlign: 'center', textTransform: 'capitalize' }}>
          {monthLabel(year, month)}
        </div>
        <button style={navBtnStyle} onClick={() => setMonthOffset((o) => o + 1)}>›</button>
      </div>

      {addingNew && draft && (
        <div style={{ margin: '0 18px 16px' }}>
          <ShiftEditForm
            draft={draft} departments={departments} title="Nowa zmiana" busy={busy}
            onChange={setDraft} onSave={saveDraft} onCancel={cancelEdit}
          />
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 18, padding: '0 18px' }}>
        {grouped.map(([date, dayShifts]) => (
          <div key={date}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)', marginBottom: 8, textTransform: 'capitalize' }}>
              {dayLabel(date)}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {dayShifts.map((s) =>
                editingId === s.id && draft ? (
                  <ShiftEditForm
                    key={s.id}
                    draft={draft} departments={departments} title="Edytuj zmianę" busy={busy}
                    onChange={setDraft} onSave={saveDraft} onCancel={cancelEdit} onDelete={deleteShift}
                  />
                ) : (
                  <ShiftRow key={s.id} shift={s} onOpen={() => openEdit(s)} />
                ),
              )}
            </div>
          </div>
        ))}
        {shifts && grouped.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--muted)', fontSize: 14 }}>
            Brak zmian w tym miesiącu
          </div>
        )}
      </div>
    </div>
  )
}

function ShiftRow({ shift, onOpen }: { shift: Shift; onOpen: () => void }) {
  const praca = shift.kind === 'work'
  const barColor = praca ? 'var(--praca)' : 'var(--dyzur)'
  const pillBg = praca ? 'var(--praca-soft)' : 'var(--dyzur-soft)'
  const pillColor = praca ? 'var(--praca)' : 'var(--dyzur)'
  return (
    <div
      onClick={onOpen}
      style={{
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '13px 14px',
        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12,
      }}
    >
      <div style={{ width: 4, alignSelf: 'stretch', borderRadius: 3, background: barColor }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>
            {fmtTime(shift.start)}–{shift.end ? fmtTime(shift.end) : '…'}
          </span>
          <span className="pill" style={{ background: pillBg, color: pillColor }}>{praca ? 'Praca' : 'Dyżur'}</span>
          {!!shift.night_hours && shift.night_hours > 0 && (
            <span className="pill" style={{ background: 'var(--night-soft)', color: 'var(--night)' }}>noc</span>
          )}
        </div>
        <div style={{ fontSize: 12, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {shift.oddzial}
          {shift.edited ? ' · poprawiono ręcznie' : ''}
        </div>
      </div>
      <div style={{ fontSize: 14, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
        {shift.hours != null ? `${fmtHours(shift.hours)} g` : '—'}
      </div>
    </div>
  )
}

const navBtnStyle = {
  fontSize: 18, color: 'var(--muted)', cursor: 'pointer', padding: '4px 10px', background: 'transparent', border: 'none',
} as const
