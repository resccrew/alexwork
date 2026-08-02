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
  disconnectGoogle: () => request<void>('/google/disconnect', { method: 'POST' }),
  sendReport: (year: number, month: number) =>
    request<{ ok: boolean }>(`/report/send?year=${year}&month=${month}`, { method: 'POST' }),
}
