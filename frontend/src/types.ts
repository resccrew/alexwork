export type ShiftKind = 'work' | 'dyzur' | 'event'

export interface Shift {
  id: number
  kind: ShiftKind
  oddzial: string
  start: string // ISO datetime
  end: string | null
  hours: number | null
  night_hours: number | null
  edited: boolean
  source: string
}

export interface SummaryDayBar {
  day: number
  minutes: number
  has_dyzur: boolean
  shifts: number
}

export interface Summary {
  year: number
  month: number
  total_hours: number
  praca_hours: number
  dyzur_hours: number
  night_hours: number
  overtime_hours: number
  earnings_simple: number
  earnings_bonus: number
  days: SummaryDayBar[]
}

export type Employment = 'etat' | 'part' | 'kontrakt'

export interface Profile {
  rate: number
  norm_hours: number
  employment: Employment
  default_oddzial: string | null
  dyzur_bonus_pct: number
  night_bonus_pct: number
  gcal_refresh_token?: string | null
}

export interface AppConfig {
  departments: string[]
  doctor_name: string
}

export interface Me {
  id: number
  first_name?: string
  last_name?: string
  username?: string
}
