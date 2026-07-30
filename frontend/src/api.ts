import { getInitData } from './telegram'
import type { AppConfig, Me, Profile, Shift, ShiftKind, Summary } from './types'

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `tma ${getInitData()}`,
      ...(options.headers ?? {}),
    },
  })
  if (!res.ok) {
    let detail = res.statusText
    try {
      const body = await res.json()
      detail = body.detail ?? detail
    } catch {
      // response wasn't JSON; keep statusText
    }
    throw new ApiError(res.status, detail)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

export interface ShiftPayload {
  kind: ShiftKind
  oddzial: string
  start: string
  end: string
}

export const api = {
  me: () => request<Me>('/me'),
  config: () => request<AppConfig>('/config'),
  status: () => request<Shift | null>('/status'),
  startShift: (kind: ShiftKind, oddzial: string) =>
    request<Shift>('/shifts/start', { method: 'POST', body: JSON.stringify({ kind, oddzial }) }),
  stopShift: () => request<Shift>('/shifts/stop', { method: 'POST' }),
  listShifts: (year: number, month: number) => request<Shift[]>(`/shifts?year=${year}&month=${month}`),
  upcomingShifts: () => request<Shift[]>('/shifts/upcoming'),
  createShift: (payload: ShiftPayload) =>
    request<Shift>('/shifts', { method: 'POST', body: JSON.stringify(payload) }),
  updateShift: (id: number, payload: Partial<ShiftPayload>) =>
    request<Shift>(`/shifts/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteShift: (id: number) => request<void>(`/shifts/${id}`, { method: 'DELETE' }),
  summary: (year: number, month: number) => request<Summary>(`/summary?year=${year}&month=${month}`),
  profile: () => request<Profile>('/profile'),
  updateProfile: (payload: Partial<Profile>) =>
    request<Profile>('/profile', { method: 'PATCH', body: JSON.stringify(payload) }),
  async downloadReport(year: number, month: number): Promise<void> {
    const res = await fetch(`/api/report?year=${year}&month=${month}`, {
      headers: { Authorization: `tma ${getInitData()}` },
    })
    if (!res.ok) throw new ApiError(res.status, res.statusText)
    const disposition = res.headers.get('content-disposition') ?? ''
    const match = disposition.match(/filename="?([^"]+)"?/)
    const filename = match?.[1] ?? `Grafik_${year}_${month}.xlsx`
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  },
}
