import type { CSSProperties } from 'react'
import type { ShiftKind } from '../types'

export interface ShiftDraft {
  id?: number
  kind: ShiftKind
  oddzial: string
  date: string // YYYY-MM-DD, start date
  start: string // HH:MM
  end: string // HH:MM
}

interface Props {
  draft: ShiftDraft
  departments: string[]
  title: string
  busy?: boolean
  onChange: (draft: ShiftDraft) => void
  onSave: () => void
  onCancel: () => void
  onDelete?: () => void
}

const inputStyle: CSSProperties = {
  width: '100%', minWidth: 0, boxSizing: 'border-box', border: '1px solid var(--border)', borderRadius: 10,
  padding: '9px 10px', fontSize: 14, color: 'var(--text)', background: 'var(--surface2)', outline: 'none',
  WebkitAppearance: 'none', appearance: 'none',
}

const typeBtnStyle = (active: boolean, color: string, soft: string): CSSProperties => ({
  flex: 1, textAlign: 'center', padding: '9px 0', borderRadius: 10, fontSize: 13, fontWeight: 600,
  cursor: 'pointer', border: 'none', background: active ? soft : 'var(--surface2)', color: active ? color : 'var(--muted)',
})

export function ShiftEditForm({ draft, departments, title, busy, onChange, onSave, onCancel, onDelete }: Props) {
  return (
    <div className="card" style={{ animation: 'fadeUp .15s ease-out' }}>
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>{title}</div>

      <div style={{ marginBottom: 12 }}>
        <input
          type="date"
          value={draft.date}
          onChange={(e) => onChange({ ...draft, date: e.target.value })}
          style={inputStyle}
        />
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 5 }}>Początek</div>
          <input
            type="time" value={draft.start}
            onChange={(e) => onChange({ ...draft, start: e.target.value })}
            style={inputStyle}
          />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 5 }}>Koniec</div>
          <input
            type="time" value={draft.end}
            onChange={(e) => onChange({ ...draft, end: e.target.value })}
            style={inputStyle}
          />
        </div>
      </div>

      <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6 }}>Typ</div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button style={typeBtnStyle(draft.kind === 'work', 'var(--praca)', 'var(--praca-soft)')} onClick={() => onChange({ ...draft, kind: 'work' })}>
          Praca
        </button>
        <button style={typeBtnStyle(draft.kind === 'dyzur', 'var(--dyzur)', 'var(--dyzur-soft)')} onClick={() => onChange({ ...draft, kind: 'dyzur' })}>
          Dyżur
        </button>
      </div>

      <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6 }}>Oddział</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
        {departments.map((d) => (
          <div
            key={d}
            className={`list-option${draft.oddzial === d ? ' selected' : ''}`}
            onClick={() => onChange({ ...draft, oddzial: d })}
          >
            {d}
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        {onDelete && (
          <button
            onClick={onDelete}
            style={{
              padding: '11px 14px', borderRadius: 11, fontSize: 13, fontWeight: 600,
              color: 'var(--danger)', border: '1px solid var(--danger)', background: 'transparent', cursor: 'pointer',
            }}
          >
            Usuń
          </button>
        )}
        <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onCancel}>
          Anuluj
        </button>
        <button className="btn btn-primary" style={{ flex: 2 }} disabled={busy} onClick={onSave}>
          Zapisz
        </button>
      </div>
    </div>
  )
}
