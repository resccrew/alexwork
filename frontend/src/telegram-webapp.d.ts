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

  interface TelegramWebApp {
    initData: string
    initDataUnsafe: Record<string, unknown>
    colorScheme: 'light' | 'dark'
    themeParams: Record<string, string>
    MainButton: TelegramWebAppMainButton
    HapticFeedback: TelegramWebAppHaptic
    ready(): void
    expand(): void
    close(): void
    onEvent(event: string, cb: () => void): void
    offEvent(event: string, cb: () => void): void
  }

  interface Window {
    Telegram?: {
      WebApp?: TelegramWebApp
    }
  }
}
