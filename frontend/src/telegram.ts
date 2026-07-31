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

  // In fullscreen, Telegram overlays its own close/menu controls on top of the WebView --
  // without this, our header renders underneath them. Recompute on every layout change
  // Telegram fires (rotation, fullscreen toggle, safe-area change).
  applySafeArea(wa)
  wa.onEvent('safeAreaChanged', () => applySafeArea(wa))
  wa.onEvent('contentSafeAreaChanged', () => applySafeArea(wa))
  wa.onEvent('fullscreenChanged', () => applySafeArea(wa))

  // A vertical swipe on the page would otherwise be interpreted by Telegram as
  // "swipe down to close" even mid-scroll in fullscreen mode -- stop it from
  // dismissing the app accidentally while the user is interacting with a screen.
  wa.disableVerticalSwipes?.()
}

function applySafeArea(wa: TelegramWebApp) {
  const top = (wa.safeAreaInset?.top ?? 0) + (wa.contentSafeAreaInset?.top ?? 0)
  document.documentElement.style.setProperty('--tg-safe-top', `${top}px`)
}

export function applyScheme(scheme?: string, isManual = false) {
  const newScheme = scheme === 'dark' ? 'dark' : 'light'
  if (isManual) {
    localStorage.setItem('theme', newScheme)
    document.documentElement.dataset.scheme = newScheme
  } else {
    const saved = localStorage.getItem('theme')
    if (saved) {
      document.documentElement.dataset.scheme = saved
    } else {
      document.documentElement.dataset.scheme = newScheme
    }
  }
}

export function getTelegramUser(): TelegramWebAppUser | undefined {
  return getWebApp()?.initDataUnsafe?.user
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
