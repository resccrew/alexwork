export function fmtHours(h: number): string {
  return h.toFixed(1).replace('.', ',')
}

export function pad(n: number): string {
  return String(n).padStart(2, '0')
}

export function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })
}

export function fmtMoney(n: number): string {
  return Math.round(n).toLocaleString('pl-PL') + ' zł'
}

const MONTH_NAMES_PL = [
  'styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec',
  'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień',
]

export function monthLabel(year: number, month: number): string {
  const name = MONTH_NAMES_PL[month - 1]
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${year}`
}

export function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const total = year * 12 + (month - 1) + delta
  return { year: Math.floor(total / 12), month: (total % 12) + 1 }
}
