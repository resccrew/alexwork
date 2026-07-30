export function getWebApp(): TelegramWebApp | undefined {
  return window.Telegram?.WebApp
}

export function initTelegram() {
  const wa = getWebApp()
  if (!wa) {
    // Outside Telegram (plain browser during development): follow the OS theme instead.
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    applyScheme(mq.matches ? 'dark' : 'light')
    mq.addEventListener('change', (e) => applyScheme(e.matches ? 'dark' : 'light'))
    return
  }
  wa.ready()
  wa.expand()
  applyScheme(wa.colorScheme)
  wa.onEvent('themeChanged', () => applyScheme(wa.colorScheme))
}

export function applyScheme(scheme?: string) {
  document.documentElement.dataset.scheme = scheme === 'dark' ? 'dark' : 'light'
}

export function haptic(style: 'light' | 'medium' | 'heavy' = 'light') {
  getWebApp()?.HapticFeedback?.impactOccurred(style)
}

export function notifyHaptic(type: 'success' | 'error' | 'warning') {
  getWebApp()?.HapticFeedback?.notificationOccurred(type)
}

export function getInitData(): string {
  return getWebApp()?.initData ?? ''
}

export function confirmAction(message: string, callback: (ok: boolean) => void) {
  const wa = getWebApp()
  try {
    if (wa?.showConfirm && (wa as any).isVersionAtLeast?.('6.2')) {
      wa.showConfirm(message, callback)
      return
    }
  } catch (e) {
    console.warn('showConfirm failed, falling back to window.confirm', e)
  }
  callback(window.confirm(message))
}
