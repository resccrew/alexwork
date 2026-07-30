export {}

declare global {
  interface TelegramWebAppMainButton {
    text: string
    color?: string
    textColor?: string
    isVisible: boolean
    isActive: boolean
    show(): void
    hide(): void
    enable(): void
    disable(): void
    setText(text: string): void
    onClick(cb: () => void): void
    offClick(cb: () => void): void
  }

  interface TelegramWebAppHaptic {
    impactOccurred(style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'): void
    notificationOccurred(type: 'error' | 'success' | 'warning'): void
    selectionChanged(): void
  }

  interface TelegramWebAppUser {
    id: number
    first_name: string
    last_name?: string
    username?: string
    language_code?: string
    is_premium?: boolean
    photo_url?: string
  }

  interface TelegramWebAppSafeAreaInset {
    top: number
    bottom: number
    left: number
    right: number
  }

  interface TelegramWebApp {
    initData: string
    initDataUnsafe: { user?: TelegramWebAppUser; [key: string]: unknown }
    colorScheme: 'light' | 'dark'
    themeParams: Record<string, string>
    safeAreaInset: TelegramWebAppSafeAreaInset
    contentSafeAreaInset: TelegramWebAppSafeAreaInset
    MainButton: TelegramWebAppMainButton
    HapticFeedback: TelegramWebAppHaptic
    ready(): void
    expand(): void
    close(): void
    onEvent(event: string, cb: () => void): void
    offEvent(event: string, cb: () => void): void
    showConfirm(message: string, callback: (ok: boolean) => void): void
    isVersionAtLeast(version: string): boolean
    disableVerticalSwipes?(): void
    enableVerticalSwipes?(): void
  }

  interface Window {
    Telegram?: {
      WebApp?: TelegramWebApp
    }
  }
}
