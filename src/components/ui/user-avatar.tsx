import { cn } from '@/lib/utils'

interface UserAvatarProps {
  username:     string
  profilePhoto: string | null
  size?:        'sm' | 'md' | 'lg'
  isOnline?:    boolean
  className?:   string
}

const SIZE = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-20 w-20 text-2xl',
} as const

// Dot size + position per avatar size
const DOT = {
  sm: 'h-2.5 w-2.5 -bottom-0.5 -right-0.5',
  md: 'h-3   w-3   bottom-0    right-0',
  lg: 'h-4   w-4   bottom-0.5  right-0.5',
} as const

export function UserAvatar({ username, profilePhoto, size = 'md', isOnline, className }: UserAvatarProps) {
  return (
    <div className={cn('relative shrink-0', className)}>
      <div
        className={cn(
          'overflow-hidden rounded-full bg-muted font-bold text-muted-foreground',
          SIZE[size],
        )}
      >
        {profilePhoto ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={profilePhoto} alt={username} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            {username[0]?.toUpperCase() ?? '?'}
          </div>
        )}
      </div>

      {/* Online indicator */}
      {isOnline && (
        <span
          className={cn(
            'absolute rounded-full border-2 border-background bg-green-500',
            DOT[size],
          )}
          aria-label="Online"
        />
      )}
    </div>
  )
}
