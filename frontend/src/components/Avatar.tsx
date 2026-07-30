import { getTelegramUser } from '../telegram'

export function Avatar({ size = 40 }: { size?: number }) {
  const user = getTelegramUser()

  if (user?.photo_url) {
    return (
      <img
        src={user.photo_url}
        alt=""
        style={{
          width: size, height: size, borderRadius: '50%', objectFit: 'cover',
          border: '1px solid var(--border)', flexShrink: 0,
        }}
      />
    )
  }

  const initial = user?.first_name?.[0]?.toUpperCase() ?? ''
  return (
    <div
      style={{
        width: size, height: size, borderRadius: '50%', background: 'var(--surface2)',
        border: '1px solid var(--border)', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: size * 0.4, fontWeight: 700, color: 'var(--muted)',
      }}
    >
      {initial}
    </div>
  )
}
