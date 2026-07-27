export function fmtHours(h: number): string {
  return h.toFixed(1).replace('.', ',')
}

export function pad(n: number): string {
  return String(n).padStart(2, '0')
}

export function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
}

export function fmtMoney(n: number): string {
  return Math.round(n).toLocaleString('ru-RU') + ' zł'
}

const MONTH_NAMES_RU = [
  'январь', 'февраль', 'март', 'апрель', 'май', 'июнь',
  'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь',
]

export function monthLabel(year: number, month: number): string {
  const name = MONTH_NAMES_RU[month - 1]
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${year}`
}

export function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const total = year * 12 + (month - 1) + delta
  return { year: Math.floor(total / 12), month: (total % 12) + 1 }
}
